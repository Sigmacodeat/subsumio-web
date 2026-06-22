import { z } from "zod";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { api } from "@/lib/api";
import nodemailer from "nodemailer";
import { createHandler, apiError } from "@/lib/api-handler";
import { generateTrackingId, injectTracking, logTrackingEvent } from "@/lib/email/tracking";

const sendSchema = z.object({
  invoiceSlug: z.string().min(1, "invoiceSlug_required"),
  toEmail: z.string().optional(),
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
      const settings = await loadKanzleiSettings();
      if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
        return apiError("smtp_not_configured", "SMTP nicht konfiguriert", 400);
      }

      const page = await api.brain.getPage(body.invoiceSlug);
      const fm = page.frontmatter as Record<string, unknown>;
      const client = String(fm.client ?? "");
      const clientSlug = String(fm.client_slug ?? "");

      let recipient = body.toEmail;
      if (!recipient && clientSlug) {
        try {
          const contactPage = await api.brain.getPage(clientSlug);
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

      await transporter.sendMail({ from: fromAddr, to: recipient, subject, html });

      // Log tracking event for the outbound email
      void logTrackingEvent({
        trackingId,
        eventType: "delivered",
        raw: { source: "smtp", route: "invoice.send", recipient },
      });

      await api.brain.updatePage({
        slug: body.invoiceSlug,
        frontmatter: {
          ...fm,
          email_sent_at: new Date().toISOString(),
          email_sent_to: recipient,
        },
      });

      return Response.json({ ok: true, sentTo: recipient });
    } catch (err) {
      console.error("[invoice-send] failed:", err instanceof Error ? err.message : String(err));
      return apiError("send_failed", "Rechnung konnte nicht gesendet werden", 500);
    }
  }
);
