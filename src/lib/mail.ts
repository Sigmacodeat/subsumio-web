// Transactional mail — env-gated like Stripe billing: without RESEND_API_KEY
// nothing pretends to send. In that case the full message is printed to the
// server console (so local/first-customer testing works end-to-end) and the
// caller learns `sent: false` to surface an honest UI state.
//
// Provider: Resend REST API (no SDK dependency). Swap the fetch for another
// provider behind the same signature if needed.

import { externalFetchTimeout } from "@/lib/retry";
import { logger } from "@/lib/logger";

const log = logger("mail");

export interface MailInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
  /** Tracking ID for open/click tracking. When set, tracking pixel and link rewriting are injected into HTML. */
  trackingId?: string;
}

export interface MailResult {
  sent: boolean;
  id?: string;
  trackingId?: string;
  error?: string;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail({
  to,
  cc,
  bcc,
  subject,
  text,
  html,
  replyTo,
  headers,
  trackingId,
}: MailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "Subsumio <hello@subsum.io>";
  const bodyText =
    text ??
    html
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ??
    "";

  // Inject tracking pixel and link rewriting into HTML if trackingId is set
  let trackedHtml = html;
  if (trackingId && html) {
    try {
      const { injectTracking } = await import("@/lib/email/tracking");
      trackedHtml = injectTracking(html, trackingId);
    } catch {
      // Tracking injection must never block sending
      trackedHtml = html;
    }
  }

  if (!apiKey) {
    log.info("RESEND_API_KEY not set — printing instead of sending", {
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      body: bodyText,
    });
    return { sent: false, trackingId, error: "mail_not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
        subject,
        ...(text ? { text } : {}),
        ...(trackedHtml ? { html: trackedHtml } : {}),
        ...(!text && !trackedHtml ? { text: bodyText } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(headers ? { headers } : {}),
      }),
      signal: externalFetchTimeout(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.error("send failed", { status: res.status, detail: detail.slice(0, 300) });
      return { sent: false, error: `provider_${res.status}` };
    }
    const data = await res.json().catch(() => ({}) as { id?: string });
    return { sent: true, id: typeof data.id === "string" ? data.id : undefined, trackingId };
  } catch (err) {
    log.error("send failed", { error: err instanceof Error ? err.message : String(err) });
    return { sent: false, error: "network" };
  }
}

/** Absolute base URL for links in emails. */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  );
}
