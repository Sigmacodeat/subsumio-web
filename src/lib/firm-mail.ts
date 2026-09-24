// Case/client-facing mail routing. The firm's own SMTP wins: clients and
// courts should see the firm's domain (reputation, SPF/DKIM, replies land in
// the firm's mailbox) — same path as invoice and deadline-reminder sending.
// Resend is the fallback for firms without configured SMTP.
//
// Attachments work on both paths (nodemailer Buffer / Resend base64).

import nodemailer from "nodemailer";
import { isSmtpConfigured } from "@/lib/kanzlei-settings-server";
import type { KanzleiSettings } from "@/lib/kanzlei-settings";
import { sendMail, type MailAttachment, type MailInput } from "@/lib/mail";
import { injectTracking } from "@/lib/email/tracking";

import { logger } from "@/lib/logger";
const log = logger("firm-mail");

export interface FirmMailResult {
  sent: boolean;
  via: "smtp" | "resend" | "none";
  trackingId?: string;
  error?: string;
}

export async function sendFirmMail(
  settings: Partial<KanzleiSettings> | null,
  input: MailInput
): Promise<FirmMailResult> {
  const trackedHtml =
    input.trackingId && input.html ? safeInject(input.html, input.trackingId) : input.html;

  if (settings && isSmtpConfigured(settings)) {
    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost!,
        port: parseInt(settings.smtpPort ?? "587", 10),
        secure: settings.smtpSecure ?? false,
        auth: { user: settings.smtpUser!, pass: settings.smtpPassword! },
      });
      await transporter.sendMail({
        from: settings.emailFrom ?? settings.smtpUser!,
        to: input.to,
        ...(input.cc ? { cc: input.cc } : {}),
        ...(input.bcc ? { bcc: input.bcc } : {}),
        subject: input.subject,
        ...(input.text ? { text: input.text } : {}),
        ...(trackedHtml ? { html: trackedHtml } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
        ...(input.attachments?.length
          ? {
              attachments: input.attachments.map((a: MailAttachment) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
              })),
            }
          : {}),
      });
      return { sent: true, via: "smtp", trackingId: input.trackingId };
    } catch (err) {
      // SMTP failure falls through to Resend — a temporarily unreachable firm
      // mail server must not silently swallow a lawyer's e-mail. The audit
      // detail records which path actually carried the message.
      log.error("firm SMTP failed — falling back to Resend", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Resend path: tracking injection happens inside sendMail as well — pass the
  // raw html and let it inject (avoids double-injection of the pixel).
  const res = await sendMail({ ...input, html: input.html });
  return {
    sent: res.sent,
    via: res.sent ? "resend" : "none",
    trackingId: res.trackingId,
    error: res.error,
  };
}

function safeInject(html: string, trackingId: string): string {
  try {
    return injectTracking(html, trackingId);
  } catch {
    return html;
  }
}
