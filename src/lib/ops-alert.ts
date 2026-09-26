import { env } from "@/lib/env";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { logger } from "@/lib/logger";

const log = logger("ops-alert");

/**
 * Operator alert channel — the same ops mailbox the cron watchdog
 * (cronjob.sh) and the queue alert use: QUEUE_ALERT_EMAIL via Resend.
 * Without a configured channel the alert is logged as an error and the
 * caller learns `notified: false`; it never pretends to have alerted.
 */
export async function notifyOps(subject: string, text: string): Promise<{ notified: boolean }> {
  const to = env("QUEUE_ALERT_EMAIL");
  if (!to || !isMailConfigured()) {
    log.error(`[ops-alert] no alert channel (QUEUE_ALERT_EMAIL/RESEND_API_KEY): ${subject}`);
    return { notified: false };
  }
  try {
    const result = await sendMail({ to, subject, text });
    if (!result.sent) log.error(`[ops-alert] mail not sent: ${subject}`);
    return { notified: result.sent };
  } catch (err) {
    log.error("[ops-alert] mail failed:", err instanceof Error ? err.message : String(err));
    return { notified: false };
  }
}
