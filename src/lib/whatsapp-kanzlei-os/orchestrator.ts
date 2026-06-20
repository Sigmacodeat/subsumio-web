import { handleLegalChatMedia, handleLegalChatMessage } from "@/lib/legal-chat/actions";
import { buildDocumentRequest, extractRequestedDocumentItems, writeDocumentRequest } from "@/lib/document-requests";
import { buildIntakeRequest, writeIntakeRequest } from "@/lib/intake";
import { downloadAndStoreWhatsAppMedia, type StoredWhatsAppMedia } from "@/lib/whatsapp/media";
import { transcribeVoiceMessage } from "@/lib/whatsapp/transcribe";
import type { WhatsAppIdentity, WhatsAppIncomingMessage } from "@/lib/whatsapp/types";
import { buildWhatsAppApproval, writeWhatsAppApproval } from "./approvals";
import { buildConversationEvent, writeConversationEvent, type ConversationEventStatus } from "./events";
import { canAutoRouteWhatsApp, classifyWhatsAppRisk, textFromWhatsAppMessage } from "./risk";

export interface OrchestrationResult {
  reply: string | null;
  eventSlug: string;
  workflowRunSlug?: string;
  actionSlug?: string;
  status: ConversationEventStatus;
}

export interface OrchestratorDeps {
  fetchImpl?: typeof fetch;
  handleText?: typeof handleLegalChatMessage;
  handleMedia?: typeof handleLegalChatMedia;
  downloadMedia?: typeof downloadAndStoreWhatsAppMedia;
  transcribeVoice?: typeof transcribeVoiceMessage;
}

function confirmationText(message: WhatsAppIncomingMessage): string | null {
  if (message.type !== "reaction") return null;
  if (message.emoji === "👍") return "ja";
  if (message.emoji === "👎") return "nein";
  if (message.emoji === "❤️" || message.emoji === "♥️") return "speichern";
  return null;
}

function isMediaMessage(message: WhatsAppIncomingMessage): message is Extract<
  WhatsAppIncomingMessage,
  { type: "image" | "audio" | "voice" | "video" | "document" | "sticker" }
> {
  return ["image", "audio", "voice", "video", "document", "sticker"].includes(message.type);
}

function safeClientReply(): string {
  return [
    "Danke, Ihre Nachricht ist eingegangen.",
    "Die Kanzlei prueft den Inhalt und meldet sich. Aus Datenschutz- und Berufsgruenden gebe ich hier keine ungepruefte Rechtsauskunft.",
  ].join("\n");
}

function isClientRole(role: WhatsAppIdentity["role"] | undefined): boolean {
  return role === "client" || role === "external" || role === "intake";
}

function caseSlugFromText(text: string): string | undefined {
  const match = text.match(/\b(?:akt|akte|az|aktenzeichen)\s+([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)/i);
  const ref = match?.[1]?.trim();
  if (!ref) return undefined;
  if (ref.includes("/")) {
    return ref.startsWith("legal/cases/") ? ref : `legal/cases/${ref.replace(/^\/+/, "")}`;
  }
  return `legal/cases/${ref}`;
}

function phoneFromText(text: string): string | undefined {
  const match = text.match(/(?:\+|00)?\d[\d\s()./-]{7,}\d/);
  if (!match) return undefined;
  const phone = match[0].replace(/[^\d+]/g, "");
  if (phone.startsWith("00")) return `+${phone.slice(2)}`;
  return phone.startsWith("+") ? phone : undefined;
}

export async function orchestrateWhatsAppMessage(
  message: WhatsAppIncomingMessage,
  sender: WhatsAppIdentity,
  deps: OrchestratorDeps = {}
): Promise<OrchestrationResult> {
  const handleText = deps.handleText ?? handleLegalChatMessage;
  const handleMedia = deps.handleMedia ?? handleLegalChatMedia;
  const downloadMedia = deps.downloadMedia ?? downloadAndStoreWhatsAppMedia;
  const transcribeVoice = deps.transcribeVoice ?? transcribeVoiceMessage;

  let normalizedText = confirmationText(message) ?? textFromWhatsAppMessage(message);
  let storedMedia: StoredWhatsAppMedia | null = null;

  if (message.type === "voice") {
    storedMedia = await downloadMedia(message);
    const transcription = await transcribeVoice(storedMedia);
    if (transcription.text) normalizedText = transcription.text;
  }

  const risk = classifyWhatsAppRisk({
    text: normalizedText,
    messageType: message.type,
    senderRole: sender.role,
  });
  const event = buildConversationEvent({
    message,
    sender,
    normalizedText,
    risk,
    status: risk.requiresApproval ? "pending_approval" : "received",
    details: storedMedia ? { media: storedMedia } : undefined,
  });

  await writeConversationEvent(sender.brainId, event, deps.fetchImpl);

  if (!canAutoRouteWhatsApp({ risk, senderRole: sender.role })) {
    let targetSlug: string | undefined;
    if (isClientRole(sender.role)) {
      const intake = buildIntakeRequest({
        source: "whatsapp",
        summary: normalizedText || `[${message.type}]`,
        clientName: sender.name,
        phoneHash: sender.phoneHash,
        sourceEventSlug: event.slug,
        status: "new",
      });
      const written = await writeIntakeRequest(sender.brainId, intake, deps.fetchImpl);
      targetSlug = written.slug;
    } else if (risk.intent === "document_request") {
      const caseSlug = caseSlugFromText(normalizedText);
      if (caseSlug) {
        const request = await buildDocumentRequest({
          caseSlug,
          items: extractRequestedDocumentItems(normalizedText),
          channel: "whatsapp",
          recipientRole: "client",
          status: "draft",
          sourceEventSlug: event.slug,
          includePortalLink: true,
        });
        const written = await writeDocumentRequest(sender.brainId, request, deps.fetchImpl);
        targetSlug = written.slug;
      }
    }
    const documentItems = risk.intent === "document_request"
      ? extractRequestedDocumentItems(normalizedText).map((item) => item.label)
      : undefined;
    const documentMessageDraft = risk.intent === "document_request"
      ? `Bitte reichen Sie folgende Unterlagen ein: ${(documentItems ?? ["Unterlagen"]).join(", ")}.`
      : undefined;
    const approval = buildWhatsAppApproval({
      sender,
      eventSlug: event.slug,
      normalizedText,
      risk,
      targetSlug,
      caseSlug: caseSlugFromText(normalizedText),
      recipientPhone: isClientRole(sender.role) ? sender.phone : phoneFromText(normalizedText),
      messageDraft: documentMessageDraft,
      documentItems,
    });
    const approvalRecord = await writeWhatsAppApproval(sender.brainId, approval, deps.fetchImpl);
    return {
      reply: safeClientReply(),
      eventSlug: event.slug,
      actionSlug: approvalRecord.slug,
      status: "pending_approval",
    };
  }

  if (message.type === "text" || message.type === "button_reply" || message.type === "list_reply" || message.type === "reaction") {
    if (message.type === "reaction" && !normalizedText) {
      return {
        reply: `Reaktion ${message.emoji} erhalten. Nutze Daumen hoch zum Bestaetigen, Daumen runter zum Verwerfen.`,
        eventSlug: event.slug,
        status: "routed",
      };
    }
    const reply = await handleText({
      sender,
      fromPhone: message.from,
      messageId: message.id,
      text: normalizedText,
    });
    return { reply, eventSlug: event.slug, status: "executed" };
  }

  if (isMediaMessage(message)) {
    const media = storedMedia ?? await downloadMedia(message);
    if (message.type === "voice" && normalizedText) {
      const reply = await handleText({
        sender,
        fromPhone: message.from,
        messageId: message.id,
        text: normalizedText,
      });
      return {
        reply: `Transkription: "${normalizedText}"\n\n${reply}`,
        eventSlug: event.slug,
        status: "executed",
      };
    }
    const reply = await handleMedia(
      { sender, fromPhone: message.from, messageId: message.id, caption: "caption" in message ? message.caption : undefined },
      media
    );
    return { reply, eventSlug: event.slug, status: "executed" };
  }

  if (message.type === "location") {
    const label = message.name || message.address || `${message.latitude}, ${message.longitude}`;
    return {
      reply: `Standort empfangen: ${label}\nGoogle Maps: https://maps.google.com/?q=${message.latitude},${message.longitude}`,
      eventSlug: event.slug,
      status: "executed",
    };
  }

  if (message.type === "contact") {
    const summary = message.contacts
      .map((c) => `${c.formattedName}${c.phones.length ? ` (${c.phones.join(", ")})` : ""}`)
      .join("; ");
    return {
      reply: `Kontakt empfangen: ${summary}. Im Dashboard unter WhatsApp verfuegbar.`,
      eventSlug: event.slug,
      status: "executed",
    };
  }

  return { reply: null, eventSlug: event.slug, status: "ignored" };
}
