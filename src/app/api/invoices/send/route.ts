import { z } from "zod";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError } from "@/lib/api-handler";
import { generateTrackingId, logTrackingEvent } from "@/lib/email/tracking";
import { sendFirmMail } from "@/lib/firm-mail";
import { createOpenItemForInvoice } from "@/lib/open-items";
import { invoiceIssueProblem } from "@/lib/invoice-issue";
import { recordInvoiceOutbound } from "@/lib/invoice-outbound.server";
import { rejectionResponse } from "@/lib/page-write-guards";

import { logger } from "@/lib/logger";
const log = logger("api/invoices/send");

export const maxDuration = 60;

const MAX_PDF_BYTES = 8 * 1024 * 1024;

const sendSchema = z.object({
  invoiceSlug: z.string().min(1, "invoiceSlug_required"),
  toEmail: z.string().email("toEmail_invalid").optional(),
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
      // Same channel choice as the matter e-mails: the firm's SMTP when it
      // is configured, the platform mail service otherwise.
      const settings = await loadKanzleiSettingsForBrain(ctx.brainId);

      const page = await brain.getPage(body.invoiceSlug);
      const fm = page.frontmatter as Record<string, unknown>;
      const isDraft = String(fm.status ?? "draft") === "draft";
      if (fm.status === "cancelled" || fm.status === "tombstoned") {
        return apiError("invoice_not_sendable", "Diese Rechnung kann nicht versendet werden.", 409);
      }
      // Sending a draft issues it: complete and with consistent sums, or not
      // at all — nothing leaves the office that the server would not issue.
      if (isDraft) {
        const problem = invoiceIssueProblem(fm);
        if (problem) return rejectionResponse(problem);
      }
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

      const replyTo = settings.emailFrom || settings.smtpUser || undefined;
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

      const result = await sendFirmMail(settings, {
        to: recipient,
        subject,
        html: rawHtml,
        ...(replyTo ? { replyTo } : {}),
        trackingId,
        attachments,
      });
      if (!result.sent) {
        // Nothing left the office: the invoice stays as it was.
        return result.error === "mail_not_configured"
          ? apiError(
              "mail_not_configured",
              "E-Mail-Versand ist nicht eingerichtet. Bitte den Postausgang in den Einstellungen hinterlegen.",
              400
            )
          : apiError("send_failed", "Rechnung konnte nicht gesendet werden", 502);
      }

      // Log tracking event for the outbound email
      void logTrackingEvent({
        trackingId,
        eventType: "sent",
        raw: {
          source: result.via,
          route: "invoice.send",
          recipient,
          brain_id: ctx.brainId,
          resend_id: result.id ?? null,
        },
      });

      // Postausgangsbuch: the invoice mail with matter and invoice number.
      const caseSlugs = Array.isArray(fm.case_slugs) ? (fm.case_slugs as unknown[]) : [];
      await recordInvoiceOutbound(ctx.headers, {
        recipient,
        recipientName: client || recipient,
        caseSlug: caseSlugs.length > 0 ? String(caseSlugs[0]) : undefined,
        subject: `Rechnung ${String(fm.invoice_number ?? body.invoiceSlug)}`,
        sentBy: ctx.user.email ?? ctx.user.id,
        trackingId: result.trackingId ?? trackingId,
        providerId: result.id,
      });

      // Merge only the delivery bookkeeping — never the whole (possibly
      // stale) frontmatter written back.
      await brain.updatePage({
        slug: body.invoiceSlug,
        frontmatter: {
          // A draft that went out by e-mail is sent; paid/overdue stay as they are.
          ...(isDraft ? { status: "sent", sent_at: new Date().toISOString() } : {}),
          email_sent_at: new Date().toISOString(),
          email_sent_to: recipient,
          email_attachment: attachments.length > 0,
        },
      });

      // OPOS: versendete Rechnung erzeugt einen offenen Posten (Industrie-
      // Standard: OP entsteht mit dem Buchen/Versand). Best-effort — die
      // Rechnung ist versendet, ein fehlender OP darf den Versand nicht
      // rückabwickeln, wird aber geloggt statt still verschluckt.
      try {
        await createOpenItemForInvoice(ctx.headers, body.invoiceSlug, fm);
      } catch (err) {
        log.error(
          "[invoice-send] open item failed:",
          err instanceof Error ? err.message : String(err)
        );
      }

      return Response.json({ ok: true, sentTo: recipient });
    } catch (err) {
      log.error("[invoice-send] failed:", err instanceof Error ? err.message : String(err));
      return apiError("send_failed", "Rechnung konnte nicht gesendet werden", 500);
    }
  }
);
