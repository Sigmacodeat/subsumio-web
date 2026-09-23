/**
 * Twilio SMS adapter (WP-8.53).
 *
 * Env-gated: without TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN and a sender
 * (TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID) the adapter reports
 * `not_configured` — it never simulates a send.
 *
 * Uses the Twilio REST API directly (no SDK dependency):
 *   POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
 * authenticated with HTTP Basic (SID:AuthToken). Response `sid` is the
 * provider reference kept for delivery tracking.
 */

import { env } from "@/lib/env";

export interface SmsSendResult {
  ok: boolean;
  /** Twilio message SID when accepted. */
  sid?: string;
  error?: string;
  /** True when the failure is missing configuration, not a provider error. */
  notConfigured?: boolean;
}

export function isSmsConfigured(): boolean {
  return Boolean(
    env("TWILIO_ACCOUNT_SID") &&
    env("TWILIO_AUTH_TOKEN") &&
    (env("TWILIO_FROM_NUMBER") || env("TWILIO_MESSAGING_SERVICE_SID"))
  );
}

/** Twilio hard limit is 1600 chars per message body. */
export const SMS_MAX_BODY = 1600;

export async function sendSms(params: { to: string; body: string }): Promise<SmsSendResult> {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM_NUMBER");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    return { ok: false, notConfigured: true, error: "sms_not_configured" };
  }
  if (!params.to || params.body.length === 0 || params.body.length > SMS_MAX_BODY) {
    return { ok: false, error: "invalid_message" };
  }

  const form = new URLSearchParams({ To: params.to, Body: params.body });
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else form.set("From", from!);
  // Delivery tracking: Twilio ruft /api/sms/status mit Signatur zurück.
  const appUrl = env("NEXT_PUBLIC_APP_URL");
  if (appUrl) form.set("StatusCallback", `${appUrl.replace(/\/+$/, "")}/api/sms/status`);

  let res: Response;
  try {
    res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch {
    return { ok: false, error: "twilio_unreachable" };
  }
  if (!res.ok) {
    // Twilio error bodies carry `code`/`message`; never surface secrets.
    let detail = `http_${res.status}`;
    try {
      const j = (await res.json()) as { code?: number; message?: string };
      if (j.code) detail = `twilio_${j.code}`;
    } catch {
      /* keep http status */
    }
    return { ok: false, error: detail };
  }
  const json = (await res.json().catch(() => ({}))) as { sid?: string };
  return { ok: true, sid: json.sid };
}
