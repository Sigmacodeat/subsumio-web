import { handleLegalChatMedia, handleLegalChatMessage } from "@/lib/legal-chat/actions";
import {
  buildDocumentRequest,
  extractRequestedDocumentItems,
  writeDocumentRequest,
} from "@/lib/document-requests";
import { buildIntakeRequest, writeIntakeRequest } from "@/lib/intake";
import { downloadAndStoreWhatsAppMedia, type StoredWhatsAppMedia } from "@/lib/whatsapp/media";
import { transcribeVoiceMessage } from "@/lib/whatsapp/transcribe";
import { phoneHash } from "@/lib/whatsapp/verify";
import type {
  WhatsAppIdentity,
  WhatsAppIncomingMessage,
  WhatsAppInteractiveButtonMessage,
} from "@/lib/whatsapp/types";
import { buildWhatsAppApproval, writeWhatsAppApproval } from "./approvals";
import {
  buildConversationEvent,
  writeConversationEvent,
  type ConversationEventStatus,
} from "./events";
import { canAutoRouteWhatsApp, classifyWhatsAppRisk, textFromWhatsAppMessage } from "./risk";
import { parseFeedbackFromReply, recordBriefingFeedback } from "@/lib/whatsapp/briefing-feedback";
import { wasBriefingSentToday } from "@/lib/whatsapp/daily-briefing";
import {
  parseApprovalResponse,
  matchApprovalByReference,
  responseToApprovalDecision,
  createApprovalRequestEvent,
  type NotificationEvent,
} from "@/lib/whatsapp-event-bus";
import { executeApprovedAction, type ApprovalExecutionDeps } from "@/lib/approval-execution";
import type { ActionType } from "@/lib/approval";

/**
 * Briefing feedback was dead code (P1-SECR-006 followup): nothing ever
 * called recordBriefingFeedback, so proactivePrecision in
 * computeSecretaryMetrics stayed null forever. Wiring it in here, AFTER
 * handleText runs rather than before, is deliberate: "ja"/"nein" already
 * mean confirm/cancel for a pending action (the higher-value, established
 * flow) — that ambiguity is exactly why a bare "ja" can't be intercepted
 * up front without risking misrouting a real confirmation. Only when
 * handleText itself reports "no pending action found" AND a briefing went
 * out today to this sender do we treat the same reply as feedback instead.
 */
const NO_PENDING_ACTION_REPLIES = [
  "Keine offene Aktion zum Speichern gefunden.",
  "Keine offene Aktion zum Verwerfen gefunden.",
];

async function captureBriefingFeedbackIfApplicable(
  sender: WhatsAppIdentity,
  normalizedText: string,
  reply: string | null
): Promise<string | null> {
  if (!reply || !NO_PENDING_ACTION_REPLIES.includes(reply)) return null;
  const parsed = parseFeedbackFromReply(normalizedText);
  if (!parsed.isFeedback || parsed.useful === null) return null;
  const dedupKey = `${sender.brainId}:${phoneHash(sender.phone)}`;
  if (!(await wasBriefingSentToday(dedupKey))) return null;

  await recordBriefingFeedback({
    brain_id: sender.brainId,
    org_id: sender.orgId,
    user_id: sender.id,
    useful: parsed.useful,
    briefing_at: new Date().toISOString(),
  });
  return parsed.useful
    ? "Danke fürs Feedback! Freut mich, dass das Briefing hilft."
    : "Danke fürs Feedback — ich werde versuchen, das Briefing nützlicher zu machen.";
}

export interface OrchestrationResult {
  reply: string | null;
  interactive?: WhatsAppInteractiveButtonMessage;
  eventSlug: string;
  workflowRunSlug?: string;
  actionSlug?: string;
  notificationEvent?: NotificationEvent;
  status: ConversationEventStatus;
}

export interface OrchestratorDeps {
  fetchImpl?: typeof fetch;
  handleText?: typeof handleLegalChatMessage;
  handleMedia?: typeof handleLegalChatMedia;
  downloadMedia?: typeof downloadAndStoreWhatsAppMedia;
  transcribeVoice?: typeof transcribeVoiceMessage;
  /** Approval return channel: list pending approvals for this sender */
  listPendingApprovals?: (
    brainId: string,
    senderId: string
  ) => Promise<Array<{ action_slug: string; action_type: ActionType }>>;
  /** Approval return channel: update approval status after response */
  updateApprovalStatus?: (
    brainId: string,
    actionSlug: string,
    status: "approved" | "rejected",
    decidedBy: string,
    rejectReason?: string
  ) => Promise<boolean>;
  /** Approval execution deps (optional — if provided, approved actions auto-execute) */
  approvalExecutionDeps?: ApprovalExecutionDeps;
}

function confirmationText(message: WhatsAppIncomingMessage): string | null {
  if (message.type !== "reaction") return null;
  if (message.emoji === "👍") return "ja";
  if (message.emoji === "👎") return "nein";
  if (message.emoji === "❤️" || message.emoji === "♥️") return "speichern";
  return null;
}

function isMediaMessage(
  message: WhatsAppIncomingMessage
): message is Extract<
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

/**
 * G3: If a reply text contains the "Antworte mit JA" confirmation pattern,
 * convert it into an interactive button message with Ja/Nein buttons
 * for a better UX — the lawyer can tap instead of typing.
 */
function buildConfirmationButtons(reply: string): WhatsAppInteractiveButtonMessage | null {
  if (!/antworte\s+mit\s+ja/i.test(reply)) return null;
  const bodyText = reply.replace(/\s*Antworte\s+mit\s+JA.*$/i, "").trim();
  return {
    type: "button",
    body: { text: bodyText || "Bitte bestätigen:" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "confirm_yes", title: "Ja, speichern" } },
        { type: "reply", reply: { id: "confirm_no", title: "Nein, verwerfen" } },
      ],
    },
    footer: { text: "Tippen zum Bestätigen oder Verwerfen" },
  };
}

/**
 * Approval Return Channel (P1-SECR-005)
 *
 * Checks if an inbound WhatsApp message is an approval response (Ja/Nein + reference).
 * If so, matches it to a pending approval and updates its status.
 * Returns null if the message is NOT an approval response (normal processing continues).
 */
async function tryApprovalReturnChannel(
  message: WhatsAppIncomingMessage,
  sender: WhatsAppIdentity,
  normalizedText: string,
  deps: OrchestratorDeps
): Promise<{ reply: string; actionSlug: string } | null> {
  if (!deps.listPendingApprovals || !deps.updateApprovalStatus) return null;
  if (sender.role !== "admin" && sender.role !== "lawyer" && sender.role !== "assistant")
    return null;

  const parsed = parseApprovalResponse(normalizedText);
  if (parsed.response === "unknown") return null;

  const pending = await deps.listPendingApprovals(sender.brainId, sender.id);
  if (pending.length === 0) return null;

  const matched = matchApprovalByReference(parsed, pending);
  if (!matched) return null;

  const decision = responseToApprovalDecision(parsed);
  if (!decision) return null;

  const updated = await deps.updateApprovalStatus(
    sender.brainId,
    matched.action_slug,
    decision.status as "approved" | "rejected",
    sender.id,
    decision.reject_reason
  );

  if (!updated) return null;

  // Auto-execute if approved and execution deps are available
  if (decision.status === "approved" && deps.approvalExecutionDeps) {
    try {
      await executeApprovedAction(deps.approvalExecutionDeps, {
        actionSlug: matched.action_slug,
        executedBy: sender.id,
      });
    } catch (err) {
      console.error("[orchestrator] Approval auto-execution failed:", err);
    }
  }

  const replyText =
    decision.status === "approved"
      ? `✅ Freigabe bestätigt für ${matched.action_type} (${matched.action_slug.slice(-8)}).`
      : `❌ Abgelehnt: ${matched.action_type} (${matched.action_slug.slice(-8)}).${parsed.reject_reason ? ` Grund: ${parsed.reject_reason}` : ""}`;

  return { reply: replyText, actionSlug: matched.action_slug };
}

function caseSlugFromText(text: string): string | undefined {
  const match = text.match(
    /\b(?:akt|akte|az|aktenzeichen)\s+([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)/i
  );
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

  // G3: Map interactive button replies to confirmation intents
  if (message.type === "button_reply") {
    if (message.buttonId === "confirm_yes") normalizedText = "ja";
    else if (message.buttonId === "confirm_no") normalizedText = "nein";
    else normalizedText = message.buttonText || message.buttonId;
  }

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

  // ── Approval Return Channel (P1-SECR-005) ────────────────────────────
  // Check if this message is an approval response (Ja/Nein + reference)
  // BEFORE routing to risk-based approval or legal chat.
  if (normalizedText && (message.type === "text" || message.type === "reaction")) {
    const approvalResult = await tryApprovalReturnChannel(message, sender, normalizedText, deps);
    if (approvalResult) {
      return {
        reply: approvalResult.reply,
        eventSlug: event.slug,
        actionSlug: approvalResult.actionSlug,
        status: "executed",
      };
    }
  }

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
          brainId: sender.brainId,
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
    const documentItems =
      risk.intent === "document_request"
        ? extractRequestedDocumentItems(normalizedText).map((item) => item.label)
        : undefined;
    const documentMessageDraft =
      risk.intent === "document_request"
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

    // ── Publish approval_request event to Notification Event Bus (P1-SECR-001) ──
    // This makes the approval visible to the WhatsApp notification handler,
    // which will send a proactive WhatsApp message to the lawyer with the
    // approval summary and the reference code for the return channel.
    let notificationEvent: NotificationEvent | undefined;
    try {
      notificationEvent = createApprovalRequestEvent({
        brain_id: sender.brainId,
        org_id: sender.orgId,
        case_slug: caseSlugFromText(normalizedText),
        action_slug: approvalRecord.slug,
        action_type: approvalRecord.actionType,
        summary: normalizedText.slice(0, 200),
        recipient_user_ids: [sender.id],
        recipient_phone: sender.phone,
      });
      // The event bus is initialized and dispatched by the webhook route
      // or cron job — here we just make the event available via a side channel.
      // The webhook route can pick this up from the orchestrator result.
    } catch {
      // Non-blocking: event bus is best-effort, not critical path
    }

    return {
      reply: safeClientReply(),
      eventSlug: event.slug,
      actionSlug: approvalRecord.slug,
      notificationEvent,
      status: "pending_approval",
    };
  }

  if (
    message.type === "text" ||
    message.type === "button_reply" ||
    message.type === "list_reply" ||
    message.type === "reaction"
  ) {
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
    const feedbackReply = await captureBriefingFeedbackIfApplicable(sender, normalizedText, reply);
    const finalReply = feedbackReply ?? reply;
    const interactive = buildConfirmationButtons(finalReply) ?? undefined;
    return { reply: finalReply, interactive, eventSlug: event.slug, status: "executed" };
  }

  if (isMediaMessage(message)) {
    const media = storedMedia ?? (await downloadMedia(message));
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
      {
        sender,
        fromPhone: message.from,
        messageId: message.id,
        caption: "caption" in message ? message.caption : undefined,
      },
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
