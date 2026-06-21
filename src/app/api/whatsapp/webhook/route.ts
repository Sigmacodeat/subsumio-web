import { NextRequest } from "next/server";
import { sendWhatsAppText } from "@/lib/whatsapp/send";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { isMessageProcessed, markMessageProcessed } from "@/lib/whatsapp/dedup";
import {
  extractIncomingMessages,
  extractMessageStatuses,
  type WhatsAppWebhookPayload,
  type WhatsAppMessageStatus,
} from "@/lib/whatsapp/types";
import { verifyWebhookChallenge, verifyWhatsAppSignature, phoneHash } from "@/lib/whatsapp/verify";
import { resolveSenderIdentity } from "@/lib/whatsapp/identity";
import { getWhatsAppWindowStore } from "@/lib/whatsapp/window-store";
import { orchestrateWhatsAppMessage } from "@/lib/whatsapp-kanzlei-os/orchestrator";
import { buildWhatsAppMessageBody } from "@/lib/whatsapp-event-bus";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { createWebhookHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const result = verifyWebhookChallenge(new URL(req.url).searchParams);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return new Response(result.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
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

    const sender = await resolveSenderIdentity(message.from);
    if (!sender) {
      // Deny unknown/suspended/revoked senders. Audit by phone hash only — never log the raw number.
      await logAudit("whatsapp.sender_denied", "whatsapp_identity", {
        details: { phoneHash: phoneHash(message.from), messageId: message.id },
      });
      results.push({ id: message.id, status: "ignored", error: "sender_not_allowed" });
      continue;
    }

    // Inbound message (re)opens the 24h customer-service window for this recipient.
    await getWhatsAppWindowStore().touch(phoneHash(message.from));

    try {
      const result = await orchestrateWhatsAppMessage(message, sender);
      if (result.reply) {
        await sendWhatsAppText(message.from, result.reply);
      }

      // ── Dispatch approval notification via Event Bus (P1-SECR-001) ──────
      // If the orchestrator created a pending approval with a notification event,
      // send a proactive WhatsApp message to the lawyer with the approval summary.
      if (result.status === "pending_approval" && result.actionSlug) {
        try {
          const approvalPageRes = await fetch(
            `${ENGINE_URL}/api/pages/${encodeURIComponent(`legal/chat/actions/${result.actionSlug}`)}`,
            { headers: engineHeadersForBrain(sender.brainId) }
          );
          if (approvalPageRes.ok) {
            const approvalPage = await approvalPageRes.json();
            const fm = approvalPage.frontmatter ?? {};
            if (fm._notificationEvent) {
              const event = fm._notificationEvent;
              const messageBody = buildWhatsAppMessageBody(event);
              if (event.recipient_phone && messageBody) {
                await sendProactiveMessage({
                  to: event.recipient_phone,
                  brainId: sender.brainId,
                  scope: "approval_request",
                  freeform: messageBody,
                  urgent: true,
                });
              }
            }
          }
        } catch {
          // Non-blocking: notification dispatch is best-effort
        }
      }

      await markMessageProcessed(message.id, phoneHash(message.from), message.type, result.status);
      results.push({ id: message.id, status: result.status });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("[whatsapp-webhook] message failed:", error);
      try {
        await sendWhatsAppText(
          message.from,
          "Kanzlei OS konnte die Nachricht derzeit nicht verarbeiten. Bitte versuchen Sie es später erneut."
        );
      } catch {}
      await markMessageProcessed(message.id, phoneHash(message.from), message.type, "failed");
      results.push({ id: message.id, status: "failed" });
    }
  }

  return Response.json({
    success: true,
    processed: results.length,
    statuses: statuses.length,
    results,
  });
});

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
      console.error(
        "[whatsapp-webhook] status update failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
