import { NextRequest } from "next/server";
import { sendWhatsAppText, sendWhatsAppInteractive } from "@/lib/whatsapp/send";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { isMessageProcessed, markMessageProcessed } from "@/lib/whatsapp/dedup";
import {
  extractIncomingMessages,
  extractMessageStatuses,
  type WhatsAppWebhookPayload,
  type WhatsAppMessageStatus,
  type WhatsAppIdentity,
  type WhatsAppIncomingMessage,
} from "@/lib/whatsapp/types";
import { verifyWebhookChallenge, verifyWhatsAppSignature, phoneHash } from "@/lib/whatsapp/verify";
import { resolveSenderIdentity } from "@/lib/whatsapp/identity";
import {
  isWhatsAppStaffRole,
  resolveStaffAccount,
  staffAccountDeniedReply,
} from "@/lib/whatsapp/staff-account";
import { getWhatsAppWindowStore } from "@/lib/whatsapp/window-store";
import {
  getWhatsAppConsentStore,
  isConsentActive,
  whatsAppTenantKeys,
} from "@/lib/whatsapp/consent-store";
import {
  CLIENT_CONSENT_SCOPES,
  STAFF_CONSENT_SCOPES,
  grantWhatsAppConsent,
} from "@/lib/whatsapp/consent-grant";
import { orchestrateWhatsAppMessage } from "@/lib/whatsapp-kanzlei-os/orchestrator";
import {
  approvalNotificationRecipients,
  decideWhatsAppApproval,
  listDecidableApprovals,
} from "@/lib/whatsapp/approval-channel";
import { hasPendingWhatsAppChatAction } from "@/lib/legal-chat/actions";
import { readCurrentPage } from "@/lib/page-write-guards";
import { WhatsAppMediaRejectedError } from "@/lib/whatsapp/media";
import { buildIntakeRequest, writeIntakeRequest } from "@/lib/intake";
import { loadPublicFirm, resolvePublicFormBrainId } from "@/lib/public-firm";
import { siteUrl } from "@/lib/mail";
import { buildWhatsAppMessageBody } from "@/lib/whatsapp-event-bus";
import { recordOutboundMessage, getOutboundBrainId } from "@/lib/whatsapp/outbound-tracker";
import {
  ENGINE_URL,
  engineHeadersForBrain,
  enginePatchPage,
  runAsEngineCaller,
  type EngineCaller,
} from "@/lib/engine";
import { logAudit, SYSTEM_BRAIN } from "@/lib/audit";
import {
  createCaseSafely,
  engineCaseCreateDeps,
  type SafeCaseCreateInput,
} from "@/lib/safe-case-create";
import { createWebhookHandler, createPublicHandler } from "@/lib/api-handler";
import type { BrainPage } from "@/lib/types";
import type { PageArrayMutation, PageArrayMutateResult } from "@/lib/server-brain";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { engineWriteBestEffort } from "@/lib/engine-write";
const log = logger("api/whatsapp/webhook");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const webhookChallengeSchema = z.object({
  "hub.mode": z.string(),
  "hub.challenge": z.string(),
  "hub.verify_token": z.string(),
});

export const GET = createPublicHandler(
  {
    query: webhookChallengeSchema,
  },
  async (_req, _body, query) => {
    const { "hub.mode": mode, "hub.challenge": challenge, "hub.verify_token": verifyToken } = query;
    const searchParams = new URLSearchParams();
    searchParams.set("hub.mode", mode);
    searchParams.set("hub.challenge", challenge);
    searchParams.set("hub.verify_token", verifyToken);
    const result = verifyWebhookChallenge(searchParams);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return new Response(result.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
);

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
      // Unknown (or blocked) number: no firm processing. Audit by phone hash
      // only — never log the raw number. A first contact gets one friendly
      // answer and, where a firm receives public enquiries, an intake entry.
      await logAudit("whatsapp.sender_denied", "whatsapp_identity", {
        brainId: SYSTEM_BRAIN,
        details: { phoneHash: phoneHash(message.from), messageId: message.id },
      });
      await handleUnknownSender(message).catch((err) =>
        log.error(
          "[whatsapp-webhook] unknown sender handling failed:",
          err instanceof Error ? err.message : String(err)
        )
      );
      await markMessageProcessed(
        message.id,
        phoneHash(message.from),
        message.type,
        "unknown_sender"
      );
      results.push({ id: message.id, status: "ignored", error: "sender_not_allowed" });
      continue;
    }

    // Inbound message (re)opens the 24h customer-service window for this recipient.
    await getWhatsAppWindowStore().touch(phoneHash(message.from));

    // WP-8.51: Consent-Keywords — STOPP widerruft die Einwilligung, START
    // reaktiviert sie. Läuft vor dem Orchestrator, damit ein Widerruf nie
    // in die Kanzlei-Verarbeitung rutscht.
    if (message.type === "text") {
      if (isStopKeyword(message.text)) {
        await withdrawWhatsAppConsent(message.from, sender);
        await markMessageProcessed(message.id, phoneHash(message.from), message.type, "opt_out");
        results.push({ id: message.id, status: "opt_out" });
        continue;
      }
      if (isStartKeyword(message.text)) {
        await reinstateWhatsAppConsent(message.from, sender);
        await markMessageProcessed(message.id, phoneHash(message.from), message.type, "opt_in");
        results.push({ id: message.id, status: "opt_in" });
        continue;
      }
    }

    // Vollständig widerrufene Nummer: Inbound wird archiviert + auditiert,
    // aber NICHT an den Orchestrator — ein STOPP schaltet den Kanal
    // komplett stumm (strengste Opt-out-Lesart). Neue Absender ohne jede
    // Consent-Row bleiben unberührt (inbound-initiiert = 24h-Fenster).
    if (await isFullyOptedOut(message.from, sender)) {
      await markMessageProcessed(
        message.id,
        phoneHash(message.from),
        message.type,
        "opted_out_inbound"
      );
      await logAudit("whatsapp.inbound_muted", "whatsapp_identity", {
        brainId: sender.brainId,
        details: {
          phoneHash: phoneHash(message.from),
          messageType: message.type,
          // Kurzes Snippet statt Volltext: die Kanzlei muss erkennen können,
          // OB ein rechtserheblicher Eingang ankam (z.B. Kündigung), ohne
          // die Nachricht inhaltlich zu verarbeiten. 200 Zeichen reichen
          // für diese Einordnung.
          bodySnippet: message.type === "text" ? message.text.trim().slice(0, 200) : null,
          bodyLength: message.type === "text" ? message.text.trim().length : null,
        },
      });
      results.push({ id: message.id, status: "opted_out" });
      continue;
    }

    // Firm numbers act as the linked person: without an active user account
    // of this firm there are no firm commands (fail-closed). With one, every
    // engine call below carries that person's identity, so walls, matter
    // teams and document ACLs apply as in the dashboard.
    let actingSender = sender;
    let caller: EngineCaller | undefined;
    if (isWhatsAppStaffRole(sender.role)) {
      const account = await resolveStaffAccount(sender);
      if (!account.ok) {
        await logAudit("whatsapp.sender_denied", "whatsapp_identity", {
          brainId: sender.brainId,
          details: { phoneHash: phoneHash(message.from), reason: account.reason },
        });
        try {
          await sendWhatsAppText(message.from, staffAccountDeniedReply());
        } catch {}
        await markMessageProcessed(message.id, phoneHash(message.from), message.type, "denied");
        results.push({ id: message.id, status: "ignored", error: account.reason });
        continue;
      }
      actingSender = account.sender;
      caller = account.caller;
    }

    const processMessage = () =>
      processInboundMessage(message, actingSender, results).catch(async (err) => {
        const error = err instanceof Error ? err.message : String(err);
        log.error("[whatsapp-webhook] message failed:", error);
        try {
          const errSendResult = await sendWhatsAppText(
            message.from,
            // A refused file (too large, unsafe) will not work on retry — say why.
            err instanceof WhatsAppMediaRejectedError
              ? err.userMessage
              : "Ihre Nachricht konnte gerade nicht verarbeitet werden. Bitte versuchen Sie es später erneut."
          );
          if (errSendResult.messageId && sender.brainId) {
            void recordOutboundMessage(errSendResult.messageId, sender.brainId);
          }
        } catch {}
        await markMessageProcessed(message.id, phoneHash(message.from), message.type, "failed");
        results.push({ id: message.id, status: "failed" });
      });
    await (caller ? runAsEngineCaller(caller, processMessage) : processMessage());
  }

  return Response.json({
    success: true,
    processed: results.length,
    statuses: statuses.length,
    results,
  });
});

async function processInboundMessage(
  message: WhatsAppIncomingMessage,
  sender: WhatsAppIdentity,
  results: Array<{ id: string; status: string; error?: string }>
): Promise<void> {
  // Inside runAsEngineCaller these headers carry the firm member's identity.
  const headers = engineHeadersForBrain(sender.brainId);
  const result = await orchestrateWhatsAppMessage(message, sender, {
    listPendingApprovals: (decider) => listDecidableApprovals(headers, decider),
    decideApproval: (decider, actionSlug, status, rejectReason) =>
      decideWhatsAppApproval({
        headers,
        brainId: sender.brainId,
        actionSlug,
        status,
        decider,
        rejectReason,
      }),
    hasPendingChatAction: hasPendingWhatsAppChatAction,
    approvalExecutionDeps: executionDepsForBrain(sender.brainId),
  });
  if (result.interactive) {
    const sendResult = await sendWhatsAppInteractive(message.from, result.interactive);
    if (sendResult.messageId && sender.brainId) {
      void recordOutboundMessage(sendResult.messageId, sender.brainId);
    }
  } else if (result.reply) {
    const sendResult = await sendWhatsAppText(message.from, result.reply);
    if (sendResult.messageId && sender.brainId) {
      void recordOutboundMessage(sendResult.messageId, sender.brainId);
    }
  }

  // ── Dispatch approval notification via Event Bus (P1-SECR-001) ──────
  // A new Freigabe is announced to the matter's responsible lawyer(s) with a
  // linked WhatsApp number — never to the sender (Vier-Augen) and never to a
  // client. Without a matter the dashboard queue is the place to look.
  if (result.status === "pending_approval" && result.actionSlug) {
    try {
      const event = result.notificationEvent;
      const messageBody = event ? buildWhatsAppMessageBody(event) : "";
      const recipients = messageBody
        ? await approvalNotificationRecipients(
            {
              orgId: sender.orgId,
              caseSlug: event?.case_slug,
              excludeUserId: isWhatsAppStaffRole(sender.role) ? sender.userId : undefined,
            },
            {
              readCase: async (caseSlug) => {
                const read = await readCurrentPage(ENGINE_URL, headers, caseSlug);
                return read.kind === "found"
                  ? ((read.page.frontmatter ?? {}) as Record<string, unknown>)
                  : null;
              },
            }
          )
        : [];
      for (const recipient of recipients) {
        await sendProactiveMessage({
          to: recipient.phone,
          brainId: sender.brainId,
          orgId: sender.orgId,
          scope: "approval_request",
          freeform: messageBody,
          urgent: true,
        }).catch(() => undefined);
      }
    } catch {
      // Non-blocking: notification dispatch is best-effort
    }
  }

  await markMessageProcessed(message.id, phoneHash(message.from), message.type, result.status);
  results.push({ id: message.id, status: result.status });
}

/** Store outbound message status updates in the brain as chat_outbox pages. */
async function processMessageStatuses(statuses: WhatsAppMessageStatus[]): Promise<void> {
  for (const status of statuses) {
    try {
      const slug = `legal/chat/whatsapp-outbox/${status.id}`;

      // Resolve brain ID from the outbound tracker (multi-tenant safe).
      // Falls back to WHATSAPP_DEFAULT_BRAIN_ID for legacy messages pre-dating
      // the tracker.
      let brainId = await getOutboundBrainId(status.id);
      if (!brainId) {
        brainId = process.env.WHATSAPP_DEFAULT_BRAIN_ID;
        if (!brainId) continue;
      }

      await engineWriteBestEffort(
        `${ENGINE_URL}/api/pages`,
        {
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
          signal: AbortSignal.timeout(15_000),
        },
        "WhatsApp-Zustellstatus"
      );
    } catch (err) {
      log.error(
        "[whatsapp-webhook] status update failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

function executionDepsForBrain(brainId: string) {
  const headers = engineHeadersForBrain(brainId);
  return {
    brainId,
    getPage: async (slug: string): Promise<BrainPage> => {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`approval_page_not_found:${res.status}`);
      return (await res.json()) as BrainPage;
    },
    createPage: async (page: {
      slug: string;
      title: string;
      type?: string;
      content?: string;
      frontmatter?: Record<string, unknown>;
    }) => {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(page),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`approval_effect_create_failed:${res.status}`);
      return { slug: page.slug };
    },
    updatePage: async (page: {
      slug: string;
      title?: string;
      type?: string;
      content?: string;
      frontmatter?: Record<string, unknown>;
    }) => {
      const { slug, ...patch } = page;
      const res = await enginePatchPage(headers, { slug, ...patch }, { timeoutMs: 15_000 });
      if (!res.ok) throw new Error(`approval_effect_update_failed:${res.status}`);
      return { slug, success: true };
    },
    mutatePageArray: async (
      slug: string,
      field: string,
      mutation: PageArrayMutation
    ): Promise<PageArrayMutateResult> => {
      const res = await fetch(`${ENGINE_URL}/api/pages/array-mutate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ slug, field, ...mutation }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`approval_effect_mutate_failed:${res.status}`);
      return (await res.json()) as PageArrayMutateResult;
    },
    sendProactiveWhatsApp: sendProactiveMessage,
    createCase: (input: SafeCaseCreateInput) =>
      createCaseSafely(engineCaseCreateDeps(headers), input),
  };
}

/** Die Kanzlei, der die Absender-Identität gehört (Brain- und Org-Kennung). */
function senderTenantKeys(sender: { brainId?: string; orgId?: string }): string[] {
  return whatsAppTenantKeys(sender.brainId ?? "", sender.orgId);
}

/**
 * True, wenn die Nummer bei der Kanzlei des Absenders Consent-Rows hat, aber
 * KEINE aktive — d. h. der Nutzer hat einmal eingewilligt und danach
 * widerrufen. Absender ohne jede Row (Neukontakt) zählen nicht als opted-out.
 */
async function isFullyOptedOut(
  phone: string,
  sender: { brainId?: string; orgId?: string }
): Promise<boolean> {
  const rows = await getWhatsAppConsentStore().getByPhoneHash(
    senderTenantKeys(sender),
    phoneHash(phone)
  );
  return rows.length > 0 && !rows.some(isConsentActive);
}

// ── Consent-Keywords (WP-8.51) ───────────────────────────────────────────

/**
 * STOPP: alle aktiven Einwilligungen dieser Nummer widerrufen — bei jeder
 * Kanzlei. Der Widerruf kommt von der betroffenen Person selbst (signierte
 * Nachricht von genau dieser Nummer) und gilt deshalb umfassend; Erteilen
 * und Reaktivieren bleiben kanzleigebunden.
 */
async function withdrawWhatsAppConsent(phone: string, sender: { brainId?: string }): Promise<void> {
  const store = getWhatsAppConsentStore();
  const hash = phoneHash(phone);
  const now = new Date().toISOString();
  const active = (await store.getByPhoneHashAllFirms(hash)).filter(isConsentActive);
  for (const c of active) {
    await store.update(c.id, { optOutAt: now });
  }
  await logAudit("whatsapp.consent_revoked", "whatsapp_identity", {
    brainId: sender.brainId ?? SYSTEM_BRAIN,
    details: { phoneHash: hash, revoked: active.length },
  });
  const res = await sendWhatsAppText(
    phone,
    "Verstanden — Sie erhalten keine weiteren Nachrichten von uns und " +
      "Ihre Nachrichten an diesen Kanal werden nicht mehr bearbeitet. " +
      "Mit START können Sie den Empfang jederzeit wieder aktivieren."
  );
  if (res.messageId && sender.brainId) {
    void recordOutboundMessage(res.messageId, sender.brainId);
  }
}

/**
 * START: the person asks to receive messages from this firm again (or for the
 * first time). Recorded as the person's own opt-in — but only for a number the
 * firm knows as a confirmed client or a linked firm member; an unconfirmed
 * number must confirm with its invitation code first.
 */
async function reinstateWhatsAppConsent(phone: string, sender: WhatsAppIdentity): Promise<void> {
  const hash = phoneHash(phone);
  const staff = isWhatsAppStaffRole(sender.role) && sender.userLinked === true && !!sender.userId;
  const client = sender.role === "client" && !!sender.verifiedAt;
  let granted = false;
  if (staff || client) {
    const result = await grantWhatsAppConsent({
      brainId: sender.brainId,
      orgId: sender.orgId,
      phoneHash: hash,
      subjectType: staff ? "lawyer" : "client",
      subjectRef: staff ? (sender.userId as string) : sender.id,
      scopes: staff ? STAFF_CONSENT_SCOPES : CLIENT_CONSENT_SCOPES,
      source: "start_keyword",
    });
    granted = result.status !== "withdrawn";
  }
  const res = await sendWhatsAppText(
    phone,
    granted
      ? "Danke — der Nachrichtenempfang ist aktiviert. Mit STOPP können Sie ihn jederzeit beenden."
      : "Ihre Nummer ist bei uns noch nicht für den Nachrichtenempfang freigeschaltet. Bitte bestätigen Sie zuerst den Code aus der Einladung Ihrer Kanzlei."
  );
  if (res.messageId && sender.brainId) {
    void recordOutboundMessage(res.messageId, sender.brainId);
  }
}

// ── Consent keywords: only a message that IS the keyword ───────────────────

/**
 * STOPP/START count only as the whole message ("Stopp", "STOP!", "Abmelden")
 * — a client writing "Stopp, bitte die Klage noch nicht einbringen!" or
 * "Start der Verhandlung ist am 3.10." is a message for the firm, not an
 * opt-out or opt-in.
 */
function isStopKeyword(text: string): boolean {
  return /^\s*(?:stopp?|abmelden|abbestellen|unsubscribe|opt[- ]?out)\s*[.!]*\s*$/i.test(text);
}

function isStartKeyword(text: string): boolean {
  return /^\s*(?:start|anmelden|subscribe|opt[- ]?in)\s*[.!]*\s*$/i.test(text);
}

// ── Unknown senders ─────────────────────────────────────────────────────────

const UNKNOWN_SENDER_REPLY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * A number without identity (prospect, client with a new phone) gets one
 * friendly answer per day — without any firm data — and, when this instance
 * receives public enquiries for a named firm (SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID,
 * same rule as /erstanfrage), the message is filed there as an intake
 * request without a matter. Media are not downloaded.
 */
async function handleUnknownSender(message: WhatsAppIncomingMessage): Promise<void> {
  const hash = phoneHash(message.from);
  const windowStore = getWhatsAppWindowStore();
  const lastInbound = await windowStore.getLastInbound(hash).catch(() => null);
  await windowStore.touch(hash);
  if (lastInbound && Date.now() - lastInbound.getTime() < UNKNOWN_SENDER_REPLY_INTERVAL_MS) {
    return;
  }

  const brainId = resolvePublicFormBrainId("intake");
  const firm = brainId ? await loadPublicFirm(brainId) : null;
  if (brainId && firm) {
    const text = message.type === "text" ? message.text.trim() : "";
    const intake = buildIntakeRequest({
      source: "whatsapp",
      summary: text || `[WhatsApp-${message.type}]`,
      phoneHash: hash,
      status: "new",
    });
    await writeIntakeRequest(brainId, intake);
  }

  const reply = firm
    ? [
        `Guten Tag, danke für Ihre Nachricht an ${firm.name}.`,
        "Ihre Nummer ist bei uns noch nicht hinterlegt. Wir haben Ihre Anfrage aufgenommen und melden uns.",
        `Sie können Ihr Anliegen auch hier schildern: ${siteUrl()}/erstanfrage`,
        "Bitte senden Sie über WhatsApp noch keine vertraulichen Unterlagen.",
      ].join("\n")
    : [
        "Guten Tag, danke für Ihre Nachricht.",
        "Diese WhatsApp-Nummer ist für Mandant:innen vorgesehen, deren Nummer die Kanzlei bestätigt hat.",
        "Bitte wenden Sie sich direkt an Ihre Kanzlei — sie meldet sich bei Ihnen.",
      ].join("\n");
  await sendWhatsAppText(message.from, reply);
}
