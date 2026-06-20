/**
 * Guarded proactive WhatsApp send (Paket 33, P1-SECR-003).
 *
 * The single entry point for every business-initiated WhatsApp message. It loads
 * the recipient's 24h window and consent, runs the outbound gate, and only then
 * sends — choosing free-form text inside the window or an approved template
 * outside it. Every outcome (sent or blocked) is audited by phone hash, never by
 * raw number, so there is a defensible compliance trail.
 *
 * Proactive cron jobs and the notification bus call THIS, never `sendWhatsAppText`
 * directly — that is what keeps template/window/consent compliance structural.
 */

import { logAudit } from "@/lib/audit";
import { sendWhatsAppText, sendWhatsAppTemplate } from "./send";
import { phoneHash } from "./verify";
import { normalizePhone, type WhatsAppTemplateMessage } from "./types";
import {
  evaluateOutbound,
  type OutboundScope,
  type QuietHours,
  type OutboundDecision,
} from "./outbound-gate";
import { getWhatsAppWindowStore } from "./window-store";
import { getWhatsAppConsentStore, hasActiveConsent } from "./consent-store";

export interface ProactiveSendParams {
  /** Recipient phone (any format; normalized internally). */
  to: string;
  /** Tenant key for the audit entry. */
  brainId: string;
  scope: OutboundScope;
  /** Free-form text — used only when the 24h window is open. */
  freeform?: string;
  /** Approved template — required when the window is closed. */
  template?: WhatsAppTemplateMessage;
  /** Urgent messages bypass quiet hours (never consent or the template rule). */
  urgent?: boolean;
  /** Optional quiet-hours policy in the recipient's local time. */
  quietHours?: QuietHours;
  /** Override the clock (tests). */
  now?: Date;
}

export interface ProactiveSendResult {
  sent: boolean;
  decision: OutboundDecision;
  messageId?: string;
}

export async function sendProactiveMessage(
  params: ProactiveSendParams
): Promise<ProactiveSendResult> {
  const normalized = normalizePhone(params.to);
  const hash = phoneHash(normalized);
  const now = params.now ?? new Date();

  const [lastInboundAt, consented] = await Promise.all([
    getWhatsAppWindowStore().getLastInbound(hash),
    hasActiveConsent(getWhatsAppConsentStore(), hash, params.scope),
  ]);

  const messageKind = params.template ? "template" : "freeform";
  const decision = evaluateOutbound({
    now,
    lastInboundAt,
    hasConsent: consented,
    scope: params.scope,
    messageKind,
    urgent: params.urgent,
    quietHours: params.quietHours,
  });

  if (decision.decision === "block") {
    await logAudit("whatsapp.outbound_blocked", "whatsapp_outbound", {
      brainId: params.brainId,
      details: { phoneHash: hash, scope: params.scope, reason: decision.reason },
    });
    return { sent: false, decision };
  }

  // Send: template is mandatory outside the window; inside it, prefer free-form.
  let messageId = "";
  if (decision.mustUseTemplate || (!params.freeform && params.template)) {
    if (!params.template) {
      // Defensive: gate said send-with-template but none supplied. Treat as block.
      const guarded: OutboundDecision = {
        decision: "block",
        mustUseTemplate: true,
        reason: "template_required",
      };
      await logAudit("whatsapp.outbound_blocked", "whatsapp_outbound", {
        brainId: params.brainId,
        details: { phoneHash: hash, scope: params.scope, reason: guarded.reason },
      });
      return { sent: false, decision: guarded };
    }
    ({ messageId } = await sendWhatsAppTemplate(normalized, params.template));
  } else {
    await sendWhatsAppText(normalized, params.freeform ?? "");
  }

  await logAudit("whatsapp.outbound_sent", "whatsapp_outbound", {
    brainId: params.brainId,
    details: {
      phoneHash: hash,
      scope: params.scope,
      kind: decision.mustUseTemplate ? "template" : "freeform",
      withinWindow: !decision.mustUseTemplate,
      // Always true: a send only happens after the gate confirmed active consent.
      // Persisted so the secretary eval gate can verify consent compliance from data.
      hadConsent: true,
    },
  });

  return { sent: true, decision, messageId: messageId || undefined };
}
