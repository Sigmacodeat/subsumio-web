import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { handleLegalChatMedia, handleLegalChatMessage } from "@/lib/legal-chat/actions";
import { downloadAndStoreWhatsAppMedia } from "@/lib/whatsapp/media";
import { sendWhatsAppText } from "@/lib/whatsapp/send";
import { transcribeVoiceMessage } from "@/lib/whatsapp/transcribe";
import { isMessageProcessed, markMessageProcessed } from "@/lib/whatsapp/dedup";
import { extractIncomingMessages, extractMessageStatuses, type WhatsAppWebhookPayload, type WhatsAppIncomingMessage, type WhatsAppMessageStatus } from "@/lib/whatsapp/types";
import { resolveSender, verifyWebhookChallenge, verifyWhatsAppSignature, phoneHash } from "@/lib/whatsapp/verify";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const result = verifyWebhookChallenge(new URL(req.url).searchParams);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return new Response(result.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyWhatsAppSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Process outbound message status updates (delivered/read/failed)
  const statuses = extractMessageStatuses(payload);
  if (statuses.length > 0) {
    await processMessageStatuses(statuses);
  }

  // Process inbound messages
  const messages = extractIncomingMessages(payload);
  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const message of messages) {
    if (await isMessageProcessed(message.id)) {
      results.push({ id: message.id, status: "deduped" });
      continue;
    }

    const sender = resolveSender(message.from);
    if (!sender) {
      results.push({ id: message.id, status: "ignored", error: "sender_not_allowed" });
      continue;
    }

    try {
      const reply = await processMessage(message, sender);
      if (reply) {
        await sendWhatsAppText(message.from, reply);
      }
      await markMessageProcessed(message.id, phoneHash(message.from), message.type, "processed");
      results.push({ id: message.id, status: "processed" });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("[whatsapp-webhook] message failed:", error);
      try {
        await sendWhatsAppText(message.from, `Kanzlei OS konnte die Nachricht nicht verarbeiten: ${error}`);
      } catch {}
      await markMessageProcessed(message.id, phoneHash(message.from), message.type, "failed");
      results.push({ id: message.id, status: "failed", error });
    }
  }

  return Response.json({ success: true, processed: results.length, statuses: statuses.length, results });
}

/** Store outbound message status updates in the brain as chat_outbox pages. */
async function processMessageStatuses(statuses: WhatsAppMessageStatus[]): Promise<void> {
  for (const status of statuses) {
    try {
      const slug = `legal/chat/whatsapp-outbox/${status.id}`;
      const brainId = process.env.WHATSAPP_DEFAULT_BRAIN_ID;
      if (!brainId) continue;

      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...engineHeadersForBrain(brainId),
        },
        body: JSON.stringify({
          slug,
          title: `WhatsApp Outbound: ${status.status}`,
          type: "chat_outbox",
          frontmatter: {
            type: "chat_outbox",
            provider: "whatsapp",
            message_id: status.id,
            recipient_phone_hash: status.recipientId,
            direction: "outbound",
            status: status.status,
            status_timestamp: status.timestamp,
            errors: status.errors,
            updated_at: new Date().toISOString(),
          },
          merge: true,
        }),
      });
    } catch (err) {
      console.error("[whatsapp-webhook] status update failed:", err instanceof Error ? err.message : String(err));
    }
  }
}

async function processMessage(
  message: WhatsAppIncomingMessage,
  sender: ReturnType<typeof resolveSender> & {},
): Promise<string | null> {
  // Text message → legal chat handler
  if (message.type === "text") {
    return handleLegalChatMessage({
      sender,
      fromPhone: message.from,
      messageId: message.id,
      text: message.text,
    });
  }

  // Button reply → treat as text confirmation/selection
  if (message.type === "button_reply") {
    return handleLegalChatMessage({
      sender,
      fromPhone: message.from,
      messageId: message.id,
      text: message.buttonText || message.buttonId,
    });
  }

  // List reply → treat as text selection
  if (message.type === "list_reply") {
    return handleLegalChatMessage({
      sender,
      fromPhone: message.from,
      messageId: message.id,
      text: message.listTitle || message.listRowId,
    });
  }

  // Reaction → 👍 = confirm, 👎 = cancel, ❤️ = save to case
  if (message.type === "reaction") {
    return handleReaction(message, sender);
  }

  // Location → store as case location (e.g. court address, meeting place)
  if (message.type === "location") {
    return handleLocation(message, sender);
  }

  // Contact → store contact in brain and try to match to a case
  if (message.type === "contact") {
    return handleContact(message, sender);
  }

  // Voice message → transcribe then process as text
  if (message.type === "voice") {
    const media = await downloadAndStoreWhatsAppMedia(message);
    const transcription = await transcribeVoiceMessage(media);

    if (transcription.text) {
      const reply = await handleLegalChatMessage({
        sender,
        fromPhone: message.from,
        messageId: message.id,
        text: transcription.text,
      });
      return `🎤 Transkription: "${transcription.text}"\n\n${reply}`;
    }

    return handleLegalChatMedia(
      { sender, fromPhone: message.from, messageId: message.id, caption: message.caption },
      media,
    );
  }

  // Other media (image, document, video, sticker) → media handler
  const media = await downloadAndStoreWhatsAppMedia(message);
  return handleLegalChatMedia(
    { sender, fromPhone: message.from, messageId: message.id, caption: message.caption },
    media,
  );
}

/** Handle emoji reactions: 👍 = confirm pending action, 👎 = cancel. */
async function handleReaction(
  message: WhatsAppIncomingMessage & { type: "reaction"; emoji: string; messageId: string },
  sender: ReturnType<typeof resolveSender> & {},
): Promise<string | null> {
  if (message.emoji === "👍") {
    return handleLegalChatMessage({
      sender,
      fromPhone: message.from,
      messageId: message.id,
      text: "ja",
    });
  }
  if (message.emoji === "👎") {
    return handleLegalChatMessage({
      sender,
      fromPhone: message.from,
      messageId: message.id,
      text: "nein",
    });
  }
  if (message.emoji === "❤️" || message.emoji === "♥️") {
    return handleLegalChatMessage({
      sender,
      fromPhone: message.from,
      messageId: message.id,
      text: "speichern",
    });
  }
  // Unknown reaction — acknowledge but don't process
  return `Reaktion ${message.emoji} erhalten. Nutze 👍 zum Bestätigen, 👎 zum Verwerfen.`;
}

/** Handle inbound location messages — store in brain and acknowledge. */
async function handleLocation(
  message: WhatsAppIncomingMessage & { type: "location"; latitude: number; longitude: number; name?: string; address?: string },
  sender: ReturnType<typeof resolveSender> & {},
): Promise<string> {
  const slug = `legal/chat/whatsapp-locations/${randomUUID()}`;
  const locationText = message.name || message.address
    ? `${message.name ?? ""} ${message.address ?? ""}`.trim()
    : `${message.latitude}, ${message.longitude}`;

  try {
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...engineHeadersForBrain(sender.brainId),
      },
      body: JSON.stringify({
        slug,
        title: `Standort: ${locationText}`,
        type: "chat_inbox",
        content: `WhatsApp-Standort: ${locationText}\nKoordinaten: ${message.latitude}, ${message.longitude}`,
        frontmatter: {
          type: "chat_inbox",
          provider: "whatsapp",
          message_id: message.id,
          from_phone_hash: phoneHash(message.from),
          from_name: sender.name,
          tenant_brain_id: sender.brainId,
          direction: "inbound",
          message_type: "location",
          received_at: new Date().toISOString(),
          status: "received",
          location: {
            latitude: message.latitude,
            longitude: message.longitude,
            name: message.name,
            address: message.address,
          },
        },
      }),
    });
  } catch (err) {
    console.error("[whatsapp-webhook] location storage failed:", err instanceof Error ? err.message : String(err));
  }

  return `Standort empfangen: ${locationText}\nGoogle Maps: https://maps.google.com/?q=${message.latitude},${message.longitude}`;
}

/** Handle inbound contact messages — store in brain and try to match to existing cases. */
async function handleContact(
  message: WhatsAppIncomingMessage & { type: "contact"; contacts: Array<{ formattedName: string; firstName?: string; lastName?: string; phones: string[]; emails?: string[] }> },
  sender: ReturnType<typeof resolveSender> & {},
): Promise<string> {
  const contactSummary = message.contacts.map((c) =>
    `${c.formattedName}${c.phones.length ? ` (${c.phones.join(", ")})` : ""}${c.emails?.length ? ` ${c.emails.join(", ")}` : ""}`,
  ).join("; ");

  const slug = `legal/chat/whatsapp-contacts/${randomUUID()}`;
  try {
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...engineHeadersForBrain(sender.brainId),
      },
      body: JSON.stringify({
        slug,
        title: `Kontakt: ${message.contacts.map((c) => c.formattedName).join(", ")}`,
        type: "chat_inbox",
        content: `WhatsApp-Kontakt: ${contactSummary}`,
        frontmatter: {
          type: "chat_inbox",
          provider: "whatsapp",
          message_id: message.id,
          from_phone_hash: phoneHash(message.from),
          from_name: sender.name,
          tenant_brain_id: sender.brainId,
          direction: "inbound",
          message_type: "contact",
          received_at: new Date().toISOString(),
          status: "received",
          contacts: message.contacts,
        },
      }),
    });
  } catch (err) {
    console.error("[whatsapp-webhook] contact storage failed:", err instanceof Error ? err.message : String(err));
  }

  return `Kontakt empfangen: ${contactSummary}. Im Dashboard unter WhatsApp → Inbox verfügbar.`;
}


