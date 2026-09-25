/**
 * Guarded SMS send (WP-8.53).
 *
 * Same compliance skeleton as the WhatsApp proactive-send, minus the parts
 * that are WhatsApp-platform rules: SMS has no 24h service window and no
 * template requirement. What remains — and is non-negotiable — is:
 *
 *   1. Consent — no business-initiated SMS without an active opt-in for
 *      the scope, recorded in the SMS consent store (channel-separated).
 *   2. Quiet hours — non-urgent SMS are held in the recipient's quiet window.
 *
 * Every outcome is audited by phone hash, never by raw number.
 */

import { logAudit } from "@/lib/audit";
import { phoneHash } from "@/lib/whatsapp/verify";
import { normalizePhone } from "@/lib/whatsapp/types";
import {
  isWithinQuietHours,
  type OutboundScope,
  type QuietHours,
} from "@/lib/whatsapp/outbound-gate";
import { getSmsConsentStore, hasActiveSmsConsent, smsTenantKeys } from "./consent-store";
import { sendSms, type SmsSendResult } from "./twilio";

export type SmsBlockReason = "no_consent" | "quiet_hours" | "not_configured" | "provider_error";

export interface GuardedSmsResult {
  sent: boolean;
  reason?: SmsBlockReason;
  /** Provider reference (Twilio SID) when accepted. */
  sid?: string;
  providerError?: string;
}

export async function sendGuardedSms(params: {
  to: string;
  brainId: string;
  /** The sending firm's organisation id; consent is looked up per firm. */
  orgId?: string | null;
  scope: OutboundScope;
  body: string;
  urgent?: boolean;
  quietHours?: QuietHours;
  /** Injectable for tests — defaults to the Twilio adapter. */
  send?: (p: { to: string; body: string; statusRef?: string }) => Promise<SmsSendResult>;
}): Promise<GuardedSmsResult> {
  const normalized = normalizePhone(params.to);
  const hash = phoneHash(normalized);

  const consented = await hasActiveSmsConsent(
    getSmsConsentStore(),
    smsTenantKeys(params.brainId, params.orgId),
    hash,
    params.scope
  );
  if (!consented) {
    await logAudit("sms.outbound_blocked", "sms_outbound", {
      brainId: params.brainId,
      details: { phoneHash: hash, scope: params.scope, reason: "no_consent" },
    });
    return { sent: false, reason: "no_consent" };
  }

  if (!params.urgent && params.quietHours && isWithinQuietHours(params.quietHours)) {
    await logAudit("sms.outbound_blocked", "sms_outbound", {
      brainId: params.brainId,
      details: { phoneHash: hash, scope: params.scope, reason: "quiet_hours" },
    });
    return { sent: false, reason: "quiet_hours" };
  }

  const send = params.send ?? sendSms;
  const result = await send({ to: normalized, body: params.body, statusRef: params.brainId });
  if (!result.ok) {
    const reason: SmsBlockReason = result.notConfigured ? "not_configured" : "provider_error";
    await logAudit("sms.outbound_blocked", "sms_outbound", {
      brainId: params.brainId,
      details: { phoneHash: hash, scope: params.scope, reason, providerError: result.error },
    });
    return { sent: false, reason, providerError: result.error };
  }

  await logAudit("sms.outbound_sent", "sms_outbound", {
    brainId: params.brainId,
    details: { phoneHash: hash, scope: params.scope, sid: result.sid },
  });
  return { sent: true, sid: result.sid };
}
