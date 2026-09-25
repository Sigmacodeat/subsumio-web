import { NextRequest } from "next/server";
import { sendWhatsAppText, sendWhatsAppInteractive } from "@/lib/whatsapp/send";
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
import {
  getWhatsAppConsentStore,
  isConsentActive,
  whatsAppTenantKeys,
} from "@/lib/whatsapp/consent-store";
import { orchestrateWhatsAppMessage } from "@/lib/whatsapp-kanzlei-os/orchestrator";
import { buildWhatsAppMessageBody } from "@/lib/whatsapp-event-bus";
import { recordOutboundMessage, getOutboundBrainId } from "@/lib/whatsapp/outbound-tracker";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { logAudit, SYSTEM_BRAIN } from "@/lib/audit";
import {
  createCaseSafely,
  engineCaseCreateDeps,
  type SafeCaseCreateInput,
} from "@/lib/safe-case-create";
import { createWebhookHandler, createPublicHandler } from "@/lib/api-handler";
import type { ActionType } from "@/lib/approval";
import type { BrainPage } from "@/lib/types";
import type { PageArrayMutation, PageArrayMutateResult } from "@/lib/server-brain";
import { z } from "zod";

import { logger } from "@/lib/logger";
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
      // Deny unknown/suspended/revoked senders. Audit by phone hash only — never log the raw number.
      await logAudit("whatsapp.sender_denied", "whatsapp_identity", {
        brainId: SYSTEM_BRAIN,
        details: { phoneHash: phoneHash(message.from), messageId: message.id },
      });
      results.push({ id: message.id, status: "ignored", error: "sender_not_allowed" });
      continue;
    }

    // Inbound message (re)opens the 24h customer-service window for this recipient.
    await getWhatsAppWindowStore().touch(phoneHash(message.from));

    // WP-8.51: Consent-Keywords — STOPP widerruft die Einwilligung, START
    // reaktiviert sie. Läuft vor dem Orchestrator, damit ein Widerruf nie
    // in die Kanzlei-Verarbeitung rutscht.
    if (message.type === "text") {
      const body = message.text.trim().toLowerCase();
      if (/^(stopp?|abbestellen|unsubscribe|opt.?out)\b/.test(body)) {
        await withdrawWhatsAppConsent(message.from, sender);
        await markMessageProcessed(message.id, phoneHash(message.from), message.type, "opt_out");
        results.push({ id: message.id, status: "opt_out" });
        continue;
      }
      if (/^(start|anmelden|subscribe|opt.?in)\b/.test(body)) {
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

    try {
      const result = await orchestrateWhatsAppMessage(message, sender, {
        listPendingApprovals,
        updateApprovalStatus,
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
      // If the orchestrator created a pending approval with a notification event,
      // send a proactive WhatsApp message to the lawyer with the approval summary.
      if (result.status === "pending_approval" && result.actionSlug) {
        try {
          const event = result.notificationEvent;
          const messageBody = event ? buildWhatsAppMessageBody(event) : "";
          if (event?.recipient_phone && messageBody) {
            await sendProactiveMessage({
              to: event.recipient_phone,
              brainId: sender.brainId,
              scope: "approval_request",
              freeform: messageBody,
              urgent: true,
            });
          }
        } catch {
          // Non-blocking: notification dispatch is best-effort
        }
      }

      await markMessageProcessed(message.id, phoneHash(message.from), message.type, result.status);
      results.push({ id: message.id, status: result.status });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error("[whatsapp-webhook] message failed:", error);
      try {
        const errSendResult = await sendWhatsAppText(
          message.from,
          "Kanzlei OS konnte die Nachricht derzeit nicht verarbeiten. Bitte versuche es später erneut."
        );
        if (errSendResult.messageId && sender.brainId) {
          void recordOutboundMessage(errSendResult.messageId, sender.brainId);
        }
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

      // Resolve brain ID from the outbound tracker (multi-tenant safe).
      // Falls back to WHATSAPP_DEFAULT_BRAIN_ID for legacy messages pre-dating
      // the tracker.
      let brainId = await getOutboundBrainId(status.id);
      if (!brainId) {
        brainId = process.env.WHATSAPP_DEFAULT_BRAIN_ID;
        if (!brainId) continue;
      }

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
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      log.error(
        "[whatsapp-webhook] status update failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

async function listPendingApprovals(
  brainId: string,
  _senderId: string
): Promise<Array<{ action_slug: string; action_type: ActionType }>> {
  const res = await fetch(`${ENGINE_URL}/api/pages?type=agent_action&limit=100`, {
    headers: engineHeadersForBrain(brainId),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const pages: Array<{ slug?: unknown; frontmatter?: Record<string, unknown> }> = Array.isArray(
    data.pages
  )
    ? data.pages
    : Array.isArray(data.items)
      ? data.items
      : [];
  const pending: Array<{ action_slug: string; action_type: ActionType }> = [];
  for (const page of pages) {
    const actionSlug = typeof page.slug === "string" ? page.slug : "";
    const actionType = page.frontmatter?.action_type as ActionType | undefined;
    if (actionSlug && actionType && page.frontmatter?.status === "pending") {
      pending.push({ action_slug: actionSlug, action_type: actionType });
    }
  }
  return pending;
}

async function updateApprovalStatus(
  brainId: string,
  actionSlug: string,
  status: "approved" | "rejected",
  decidedBy: string,
  rejectReason?: string
): Promise<boolean> {
  const res = await enginePatchPage(
    engineHeadersForBrain(brainId),
    {
      slug: actionSlug,
      frontmatter: {
        status,
        decided_at: new Date().toISOString(),
        decided_by: decidedBy,
        ...(status === "rejected" && rejectReason ? { reject_reason: rejectReason } : {}),
      },
    },
    { timeoutMs: 15_000 }
  );
  return res.ok;
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
 * START: widerrufene Einwilligungen reaktivieren (Double-Opt-In-proof bleibt)
 * — nur die der Kanzlei, der die Absender-Identität gehört.
 */
async function reinstateWhatsAppConsent(
  phone: string,
  sender: { brainId?: string; orgId?: string }
): Promise<void> {
  const store = getWhatsAppConsentStore();
  const hash = phoneHash(phone);
  const now = new Date().toISOString();
  const rows = await store.getByPhoneHash(senderTenantKeys(sender), hash);
  const withdrawn = rows.filter((c) => c.optOutAt);
  for (const c of withdrawn) {
    await store.update(c.id, {
      optOutAt: null,
      optInAt: now,
      consentProof: { ...c.consentProof, reinstated_via: "whatsapp_start", reinstated_at: now },
    });
  }
  await logAudit("whatsapp.consent_granted", "whatsapp_identity", {
    brainId: sender.brainId ?? SYSTEM_BRAIN,
    details: { phoneHash: hash, reinstated: withdrawn.length },
  });
  const res = await sendWhatsAppText(
    phone,
    withdrawn.length > 0
      ? "Danke — der Nachrichtenempfang wurde wieder aktiviert."
      : "Ihre Nummer ist bei uns noch nicht für den Nachrichtenempfang freigeschaltet. Bitte wenden Sie sich an Ihre Kanzlei."
  );
  if (res.messageId && sender.brainId) {
    void recordOutboundMessage(res.messageId, sender.brainId);
  }
}
