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
import { ingestVerifiedClientWhatsAppSubmission } from "@/lib/whatsapp/client-ingest";
import { isCodeMessage, verifyWhatsAppClientCode } from "@/lib/whatsapp/client-verification";
import { ACTION_LABELS, type ActionType } from "@/lib/approval";
import { canDecideApprovals } from "@/lib/approval-decision";

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
  /**
   * Approval return channel: pending Freigaben this sender could decide now
   * (visible to them, not proposed by them).
   */
  listPendingApprovals?: (
    sender: WhatsAppIdentity
  ) => Promise<Array<{ action_slug: string; action_type: ActionType; summary?: string }>>;
  /** Approval return channel: decide with the dashboard's rules (approval-decision.ts). */
  decideApproval?: (
    sender: WhatsAppIdentity,
    actionSlug: string,
    status: "approved" | "rejected",
    rejectReason?: string
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Whether this sender has an open (not expired) chat command awaiting JA. */
  hasPendingChatAction?: (sender: WhatsAppIdentity, fromPhone: string) => Promise<boolean>;
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

function staffApprovalReply(actionType: ActionType, slug: string): string {
  return [
    `Vorgang zur Freigabe vorgelegt: ${ACTION_LABELS[actionType] ?? actionType} (Referenz ${slug.slice(-8)}).`,
    "Eine zweite Person (Anwalt/Anwältin oder Administration) entscheidet im Dashboard oder per WhatsApp.",
  ].join("\n");
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

/** "Ja", "nein", "ok", 👍 … without anything else — no Freigabe reference. */
const BARE_DECISION = /^(?:ja|yes|ok|okay|approve|freigeben|nein|no|reject|ablehnen|✅|❌)[.!]?$/i;

function isStaffRole(role: WhatsAppIdentity["role"] | undefined): boolean {
  return role === "admin" || role === "lawyer" || role === "assistant";
}

function approvalRef(slug: string): string {
  return slug.slice(-8);
}

/**
 * Approval Return Channel (P1-SECR-005)
 *
 * "Ja <Referenz>" / "Nein <Referenz> <Grund>" decides a Freigabe — with the
 * dashboard's rules: only lawyers/admins, never one's own proposal, only
 * Freigaben the person can see (decideApproval / listPendingApprovals run
 * with the sender's identity). A bare "Ja" never decides a Freigabe: when
 * Freigaben are open for this person the reply asks which one is meant,
 * instead of silently confirming an unrelated chat command.
 * Returns null if the message is not meant for the Freigabe queue.
 */
async function tryApprovalReturnChannel(
  message: WhatsAppIncomingMessage,
  sender: WhatsAppIdentity,
  normalizedText: string,
  deps: OrchestratorDeps
): Promise<{ reply: string; actionSlug?: string; decided: boolean } | null> {
  if (!deps.listPendingApprovals || !deps.decideApproval) return null;
  if (!isStaffRole(sender.role)) return null;

  const parsed = parseApprovalResponse(normalizedText);
  if (parsed.response === "unknown") return null;
  const decider = canDecideApprovals(sender.role);

  if (!parsed.action_slug) {
    if (!decider || !BARE_DECISION.test(normalizedText.trim())) return null;
    const pending = await deps.listPendingApprovals(sender);
    if (pending.length === 0) return null;
    const chatOpen = deps.hasPendingChatAction
      ? await deps.hasPendingChatAction(sender, message.from)
      : false;
    const verb = parsed.response === "approve" ? "Ja" : "Nein";
    const list = pending
      .slice(0, 5)
      .map((p) => `• ${verb} ${approvalRef(p.action_slug)} — ${p.summary ?? p.action_type}`);
    return {
      decided: false,
      reply: [
        chatOpen
          ? "Offen sind Ihre Eingabe hier im Chat und Freigaben. Was meinen Sie?"
          : "Welche Freigabe meinen Sie? Bitte mit Referenz antworten:",
        ...list,
        ...(pending.length > 5 ? [`… und ${pending.length - 5} weitere im Dashboard.`] : []),
        ...(chatOpen ? ["Für Ihre Eingabe im Chat: „speichern“ oder „verwerfen“."] : []),
      ].join("\n"),
    };
  }

  if (!decider) {
    return {
      decided: false,
      reply: "Freigaben entscheiden nur Anwältinnen/Anwälte und die Administration.",
    };
  }

  const pending = await deps.listPendingApprovals(sender);
  const matched = matchApprovalByReference(parsed, pending);
  if (!matched) {
    return {
      decided: false,
      reply: `Keine offene Freigabe mit Referenz ${parsed.action_slug} gefunden, die Sie entscheiden können.`,
    };
  }

  const decision = responseToApprovalDecision(parsed);
  if (!decision) return null;

  const result = await deps.decideApproval(
    sender,
    matched.action_slug,
    decision.status as "approved" | "rejected",
    decision.reject_reason
  );
  if (!result.ok) return { decided: false, reply: result.message };

  // Auto-execute if approved and execution deps are available
  if (decision.status === "approved" && deps.approvalExecutionDeps) {
    try {
      await executeApprovedAction(deps.approvalExecutionDeps, {
        actionSlug: matched.action_slug,
        executedBy: sender.email || sender.userId || sender.id,
      });
    } catch (err) {
      console.error("[orchestrator] Approval auto-execution failed:", err);
    }
  }

  const replyText =
    decision.status === "approved"
      ? `✅ Freigabe bestätigt für ${matched.action_type} (${approvalRef(matched.action_slug)}).`
      : `❌ Abgelehnt: ${matched.action_type} (${approvalRef(matched.action_slug)}).${parsed.reject_reason ? ` Grund: ${parsed.reject_reason}` : ""}`;

  return { reply: replyText, actionSlug: matched.action_slug, decided: true };
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

/**
 * A verified client rarely types their own case number ("akt 2026-014") when
 * asking for something like an appointment — they just ask. Without this,
 * every approval built for a client fell back to no case link unless the
 * text happened to name one explicitly, even though a single-matter client's
 * matter is already known from their identity.
 *
 * For a client, an explicit case reference in the text is only trusted when
 * it's inside their own matterScope — same rule as client-ingest.ts's
 * resolveClientMatter. Without this check, a verified client could type
 * "akt 2026-099" for a matter that isn't theirs and have the built approval
 * (and, for document_request, an actual document-request page) linked to a
 * case they have no access to. Non-client senders (lawyer/assistant) keep
 * the unrestricted caseSlugFromText behavior — they're already
 * matter-scoped elsewhere (resolveAuthorizedCase in legal-chat/actions.ts).
 */
function resolveClientCaseSlug(sender: WhatsAppIdentity, text: string): string | undefined {
  const explicit = caseSlugFromText(text);
  if (!isClientRole(sender.role)) return explicit;
  const scope = Array.isArray(sender.matterScope) ? sender.matterScope.filter(Boolean) : [];
  if (explicit && scope.includes(explicit)) return explicit;
  return scope.length === 1 ? scope[0] : undefined;
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
    // The Ja/Nein buttons belong to the chat command they were sent with —
    // "speichern"/"verwerfen" keep them apart from a Freigabe decision.
    if (message.buttonId === "confirm_yes") normalizedText = "speichern";
    else if (message.buttonId === "confirm_no") normalizedText = "verwerfen";
    else normalizedText = message.buttonText || message.buttonId;
  }

  if (message.type === "voice") {
    storedMedia = await downloadMedia(message);
    const transcription = await transcribeVoice(storedMedia, sender.brainId);
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
        status: approvalResult.decided ? "executed" : "routed",
      };
    }
  }

  // A message that is only a confirmation code is checked against the
  // number's open invitations — also for an already confirmed client who was
  // invited to a further matter. Any other text is never a code attempt.
  if (isClientRole(sender.role) && message.type === "text" && isCodeMessage(normalizedText)) {
    const verification = await verifyWhatsAppClientCode({
      sender,
      text: normalizedText,
      fetchImpl: deps.fetchImpl,
    });
    if (verification.reason !== "not_code") {
      return {
        reply: verification.reply,
        eventSlug: event.slug,
        workflowRunSlug: verification.inviteSlug,
        status: verification.ok ? "executed" : "failed",
      };
    }
  }

  let clientIngestReply = "";
  if (isClientRole(sender.role)) {
    const clientMedia =
      isMediaMessage(message) && message.type !== "voice"
        ? (storedMedia ?? (await downloadMedia(message)))
        : storedMedia;
    const clientIngest = await ingestVerifiedClientWhatsAppSubmission(
      {
        sender,
        message,
        eventSlug: event.slug,
        normalizedText,
        media: clientMedia,
      },
      deps.fetchImpl
    );
    // appointment_request is handled: false on purpose — scheduling needs
    // the lawyer's actual availability, so instead of returning here it
    // falls through to the approval queue below, case-linked via
    // resolveClientCaseSlug (clientIngest already resolved it once; the
    // sender's matterScope re-resolves the same thing there).
    if (clientIngest.handled) {
      return {
        reply: clientIngest.reply,
        eventSlug: event.slug,
        workflowRunSlug: clientIngest.submissionSlug,
        status: "routed",
      };
    }
    clientIngestReply = clientIngest.reply;
  }

  if (!canAutoRouteWhatsApp({ risk, senderRole: sender.role })) {
    let targetSlug: string | undefined;
    const clientCaseSlug = resolveClientCaseSlug(sender, normalizedText);
    if (isClientRole(sender.role) && !clientCaseSlug) {
      // No matter to link this to — a new or unscoped contact. Filing it as
      // an intake is right here: this really is a first contact, not an
      // existing client's follow-up.
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
      // clientCaseSlug, not a fresh caseSlugFromText(normalizedText) call —
      // keeps this branch consistent with the case_slug already set on the
      // approval a few lines down, instead of two independent
      // (unvalidated-vs-scope-validated) computations of the same fact.
      // A verified, scoped client reaching this branch at all is currently
      // rare (ingestVerifiedClientWhatsAppSubmission files most client text
      // as a generic submission before risk-based routing runs), but for a
      // lawyer/assistant sender — the common case here — this is unchanged
      // from before (resolveClientCaseSlug returns caseSlugFromText's result
      // unmodified for non-client roles).
      const caseSlug = clientCaseSlug;
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
          recipientPhone: phoneFromText(normalizedText),
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
      caseSlug: clientCaseSlug,
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
        case_slug: clientCaseSlug,
        action_slug: approvalRecord.slug,
        action_type: approvalRecord.actionType,
        summary: normalizedText.slice(0, 200),
        // Recipients are the matter's responsible lawyers, resolved by the
        // webhook (approvalNotificationRecipients) — never the sender, and
        // never a client.
        recipient_user_ids: [],
      });
      // The event bus is initialized and dispatched by the webhook route
      // or cron job — here we just make the event available via a side channel.
      // The webhook route can pick this up from the orchestrator result.
    } catch {
      // Non-blocking: event bus is best-effort, not critical path
    }

    return {
      // clientIngestReply carries the specific reply client-ingest.ts built
      // for this case (e.g. the appointment_request acknowledgment) — using
      // the generic safeClientReply() unconditionally here meant that reply
      // was computed and then silently discarded for every client sender.
      // Firm members get a note about the Freigabe, not the client wording.
      reply: isClientRole(sender.role)
        ? clientIngestReply || safeClientReply()
        : staffApprovalReply(approvalRecord.actionType, approvalRecord.slug),
      eventSlug: event.slug,
      actionSlug: approvalRecord.slug,
      notificationEvent,
      status: "pending_approval",
    };
  }

  // Client numbers never reach the lawyer handlers below: those attach files
  // to matters and run firm commands. An unverified client's file or a stray
  // confirmation ends here with the verification notice or the safe reply.
  if (isClientRole(sender.role)) {
    return {
      reply: clientIngestReply || safeClientReply(),
      eventSlug: event.slug,
      status: "routed",
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
