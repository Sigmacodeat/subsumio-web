import { z } from "zod";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { createServerBrainClient } from "@/lib/server-brain";
import nodemailer from "nodemailer";
import { createHandler, apiError } from "@/lib/api-handler";
import { generateTrackingId, injectTracking, logTrackingEvent } from "@/lib/email/tracking";

import { logger } from "@/lib/logger";
const log = logger("api/invoices/send");

export const maxDuration = 60;

const MAX_PDF_BYTES = 8 * 1024 * 1024;

const sendSchema = z.object({
  invoiceSlug: z.string().min(1, "invoiceSlug_required"),
  toEmail: z.string().optional(),
  /** The invoice PDF as rendered in the browser (same generator as the download). */
  pdfBase64: z
    .string()
    .max(Math.ceil((MAX_PDF_BYTES * 4) / 3) + 4, "pdf_too_large")
    .optional(),
  pdfFilename: z
    .string()
    .max(120)
    .regex(/^[\w.\- ]+\.pdf$/i, "pdf_filename_invalid")
    .optional(),
});

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: sendSchema,
    audit: (_ctx, body) => ({
      action: "invoice.send" as const,
      entityType: "invoice",
      entityId: body.invoiceSlug,
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const brain = createServerBrainClient(ctx.headers);
      const settings = await loadKanzleiSettingsForBrain(ctx.brainId);
      if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
        return apiError("smtp_not_configured", "SMTP nicht konfiguriert", 400);
      }

      const page = await brain.getPage(body.invoiceSlug);
      const fm = page.frontmatter as Record<string, unknown>;
      const client = String(fm.client ?? "");
      const clientSlug = String(fm.client_slug ?? "");

      let recipient = body.toEmail;
      if (!recipient && clientSlug) {
        try {
          const contactPage = await brain.getPage(clientSlug);
          const cfm = contactPage.frontmatter as Record<string, unknown>;
          recipient = String(cfm.email ?? "");
        } catch {
          /* ignore */
        }
      }
      if (!recipient) {
        return apiError("no_recipient_email", "Keine Empfänger-E-Mail", 400);
      }

      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: parseInt(settings.smtpPort ?? "587", 10),
        secure: settings.smtpSecure ?? false,
        auth: { user: settings.smtpUser, pass: settings.smtpPassword },
      });

      const fromAddr = settings.emailFrom ?? settings.smtpUser;
      const esc = (s: unknown) =>
        String(s).replace(
          /[&<>"']/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
        );
      const invoiceNumber = esc(fm.invoice_number ?? body.invoiceSlug);
      const subject = `Rechnung ${invoiceNumber} – ${settings.kanzleiName || "Ihre Kanzlei"}`;
      const trackingId = generateTrackingId();
      const rawHtml = `<p>Sehr geehrte${client ? ` ${esc(client)}` : ""},</p>
<p>anbei finden Sie die Rechnung <strong>${invoiceNumber}</strong>.</p>
<p>Mit freundlichen Grüßen<br/>${esc(settings.anwaltName || settings.kanzleiName || "")}</p>`;
      const html = injectTracking(rawHtml, trackingId);

      let attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
      if (body.pdfBase64) {
        const pdf = Buffer.from(body.pdfBase64, "base64");
        if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-" || pdf.length > MAX_PDF_BYTES) {
          return apiError("pdf_invalid", "Die Rechnung konnte nicht als PDF angehängt werden", 400);
        }
        attachments = [
          {
            filename: body.pdfFilename ?? `Rechnung_${String(fm.invoice_number ?? "")}.pdf`,
            content: pdf,
            contentType: "application/pdf",
          },
        ];
      }

      await transporter.sendMail({ from: fromAddr, to: recipient, subject, html, attachments });

      // Log tracking event for the outbound email
      void logTrackingEvent({
        trackingId,
        eventType: "delivered",
        raw: { source: "smtp", route: "invoice.send", recipient },
      });

      await brain.updatePage({
        slug: body.invoiceSlug,
        frontmatter: {
          ...fm,
          // A draft that went out by e-mail is sent; paid/overdue stay as they are.
          ...(String(fm.status ?? "draft") === "draft"
            ? { status: "sent", sent_at: new Date().toISOString() }
            : {}),
          email_sent_at: new Date().toISOString(),
          email_sent_to: recipient,
          email_attachment: attachments.length > 0,
        },
      });

      return Response.json({ ok: true, sentTo: recipient });
    } catch (err) {
      log.error("[invoice-send] failed:", err instanceof Error ? err.message : String(err));
      return apiError("send_failed", "Rechnung konnte nicht gesendet werden", 500);
    }
  }
);
