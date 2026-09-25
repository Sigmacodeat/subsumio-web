import { z } from "zod";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { createServerBrainClient } from "@/lib/server-brain";
import nodemailer from "nodemailer";
import { createHandler, apiError } from "@/lib/api-handler";
import { applyOpenItemFee } from "@/lib/open-items";
import { dunningFeeDelta } from "@/lib/fibu";

import { logger } from "@/lib/logger";
const log = logger("api/invoices/remind");

// Mahngebühr = Delta der gemeinsamen Stufentabelle (src/lib/fibu.ts:
// DUNNING_FEES). Einheitlich mit dem OPOS-Mahnlauf — die alte prozentuale
// Formel (bis 130 % des Rechnungsbetrags) war als Verzugsschaden unhaltbar
// und ist nicht mehr erreichbar. § 288 Abs. 5 BGB (40 €) gilt nur einmalig
// für B2B, nicht als Stufenmodell — Details an DUNNING_FEES.
function calculateReminderFee(count: number): number {
  return dunningFeeDelta(count);
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
      const brain = createServerBrainClient(ctx.headers);
      const settings = await loadKanzleiSettingsForBrain(ctx.brainId);
      if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
        return apiError("smtp_not_configured", "SMTP nicht konfiguriert", 400);
      }

      const page = await brain.getPage(body.invoiceSlug);
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
      const fee = calculateReminderFee(nextCount);
      const newTotal = Math.round((total + fee) * 100) / 100;

      let recipient: string | undefined;
      if (clientSlug) {
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
${fee > 0 ? `<p>Mahngebühr: <strong>${fee.toFixed(2)} €</strong></p>` : ""}
<p>Neuer Gesamtbetrag: <strong>${newTotal.toFixed(2)} €</strong></p>
<p>Bitte überweisen Sie den Betrag umgehend.</p>
<p>Mit freundlichen Grüßen<br/>${esc(settings.anwaltName || settings.kanzleiName || "")}</p>`,
      });

      const sentAt = new Date().toISOString();
      const prevSent = Array.isArray(fm.reminder_sent_at) ? fm.reminder_sent_at : [];
      await brain.updatePage({
        slug: body.invoiceSlug,
        frontmatter: {
          ...fm,
          status: "overdue",
          reminder_count: nextCount,
          reminder_sent_at: [...prevSent, sentAt],
          reminder_fee: fee,
        },
      });

      // OPOS: Mahngebühr auf den offenen Posten aufschlagen, sonst matched
      // eine Zahlung über (Rechnung + Gebühr) nicht mehr exakt.
      try {
        await applyOpenItemFee(ctx.headers, body.invoiceSlug, fee);
      } catch (err) {
        log.error(
          "[invoice-remind] opos fee failed:",
          err instanceof Error ? err.message : String(err)
        );
      }

      return Response.json({
        ok: true,
        reminderCount: nextCount,
        fee,
        newTotal,
        sentTo: recipient,
      });
    } catch (err) {
      log.error("[invoice-remind] failed:", err instanceof Error ? err.message : String(err));
      return apiError("send_failed", "Mahnung konnte nicht gesendet werden", 500);
    }
  }
);
