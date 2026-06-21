import { z } from "zod";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { api } from "@/lib/api";
import nodemailer from "nodemailer";
import { createHandler, apiError } from "@/lib/api-handler";

function calculateReminderFee(count: number, baseAmount: number): number {
  switch (count) {
    case 1:
      return Math.max(20, Math.round(baseAmount * 0.5 * 100) / 100);
    case 2:
      return Math.max(40, Math.round(baseAmount * 1.0 * 100) / 100);
    case 3:
      return Math.max(60, Math.round(baseAmount * 1.3 * 100) / 100);
    default:
      return Math.max(20, Math.round(baseAmount * 0.5 * 100) / 100);
  }
}

const remindSchema = z.object({
  invoiceSlug: z.string().min(1, "invoiceSlug_required"),
});

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: remindSchema,
    audit: (_ctx, body) => ({
      action: "invoice.remind" as const,
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
      const status = String(fm.status ?? "draft");
      if (status !== "sent" && status !== "overdue") {
        return apiError("invoice_not_overdue", "Rechnung ist nicht überfällig", 400);
      }

      const client = String(fm.client ?? "");
      const clientSlug = String(fm.client_slug ?? "");
      const total = Number(fm.total ?? 0);
      const reminderCount = Number(fm.reminder_count ?? 0);
      const nextCount = reminderCount + 1;
      const fee = calculateReminderFee(nextCount, total);
      const newTotal = Math.round((total + fee) * 100) / 100;

      let recipient: string | undefined;
      if (clientSlug) {
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

      const mahnungLabels = ["Erste Mahnung", "Zweite Mahnung", "Dritte Mahnung"];
      const label = mahnungLabels[Math.min(nextCount - 1, 2)] || `${nextCount}. Mahnung`;
      const fromAddr = settings.emailFrom ?? settings.smtpUser;
      const esc = (s: unknown) =>
        String(s).replace(
          /[&<>"']/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
        );
      const invoiceNumber = esc(fm.invoice_number ?? body.invoiceSlug);

      await transporter.sendMail({
        from: fromAddr,
        to: recipient,
        subject: `${label} – Rechnung ${invoiceNumber}`,
        html: `<p>Sehr geehrte${client ? ` ${esc(client)}` : ""},</p>
<p>wir mussten feststellen, dass die Rechnung <strong>${invoiceNumber}</strong> über <strong>${total.toFixed(2)} €</strong> noch nicht beglichen wurde.</p>
<p><strong>${label}</strong></p>
<p>Mahngebühr: <strong>${fee.toFixed(2)} €</strong></p>
<p>Neuer Gesamtbetrag: <strong>${newTotal.toFixed(2)} €</strong></p>
<p>Bitte überweisen Sie den Betrag umgehend.</p>
<p>Mit freundlichen Grüßen<br/>${esc(settings.anwaltName || settings.kanzleiName || "")}</p>`,
      });

      const sentAt = new Date().toISOString();
      const prevSent = Array.isArray(fm.reminder_sent_at) ? fm.reminder_sent_at : [];
      await api.brain.updatePage({
        slug: body.invoiceSlug,
        frontmatter: {
          ...fm,
          status: "overdue",
          reminder_count: nextCount,
          reminder_sent_at: [...prevSent, sentAt],
          reminder_fee: fee,
        },
      });

      return Response.json({
        ok: true,
        reminderCount: nextCount,
        fee,
        newTotal,
        sentTo: recipient,
      });
    } catch (err) {
      console.error("[invoice-remind] failed:", err instanceof Error ? err.message : String(err));
      return apiError("send_failed", "Mahnung konnte nicht gesendet werden", 500);
    }
  }
);
