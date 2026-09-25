import { z } from "zod";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError } from "@/lib/api-handler";
import { applyDunningStep, findOpenItemForInvoice, planDunningStep } from "@/lib/open-items";
import { sendFirmMail } from "@/lib/firm-mail";
import { generateTrackingId, logTrackingEvent } from "@/lib/email/tracking";
import { recordInvoiceOutbound, reminderMailHtml } from "@/lib/invoice-outbound.server";
import { withKeyedLock } from "@/lib/keyed-lock";
import { formatEur } from "@/lib/utils";
import { roundEur } from "@/lib/invoice-totals";

import { logger } from "@/lib/logger";
const log = logger("api/invoices/remind");

// Mahnstufe und Mahnspesen kommen aus EINER Quelle (planDunningStep in
// src/lib/open-items.ts über die Tabelle DUNNING_FEES in src/lib/fibu.ts):
// Stufe = max(Stufe des offenen Postens, bisherige Mahnungen) + 1, Spesen =
// kumulierter Tabellenwert minus bereits berechnete Spesen. Die E-Mail nennt
// den offenen Betrag des Postens — Rechnung minus Zahlungen plus ALLE
// Mahnspesen —, also genau den Betrag, den der OP fordert.

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
    // One reminder at a time per invoice: two clicks must not send two
    // letters and charge the same level twice.
    return withKeyedLock(`invoice-remind:${ctx.brainId}:${body.invoiceSlug}`, async () => {
      try {
        const brain = createServerBrainClient(ctx.headers);
        const settings = await loadKanzleiSettingsForBrain(ctx.brainId).catch(() => null);

        const page = await brain.getPage(body.invoiceSlug);
        const fm = page.frontmatter as Record<string, unknown>;
        const status = String(fm.status ?? "draft");
        if (fm.invoice_type === "storno") {
          return apiError("not_remindable", "Eine Storno-Note wird nicht gemahnt.", 409);
        }
        if (status === "paid") {
          return apiError("invoice_already_paid", "Rechnung ist bereits bezahlt.", 409);
        }
        if (status !== "sent" && status !== "overdue") {
          return apiError("invoice_not_overdue", "Rechnung ist nicht überfällig", 400);
        }

        // OPOS is the receivable: a payment booked from the bank statement
        // settles the open item even before the invoice shows "paid".
        const openItem = await findOpenItemForInvoice(ctx.headers, body.invoiceSlug);
        if (openItem && (openItem.status === "paid" || openItem.status === "written_off")) {
          return apiError(
            "invoice_already_settled",
            openItem.status === "paid"
              ? "Der offene Posten dieser Rechnung ist bereits bezahlt — es wird keine Mahnung versendet."
              : "Der offene Posten dieser Rechnung ist ausgebucht (storniert) — es wird keine Mahnung versendet.",
            409
          );
        }

        const client = String(fm.client ?? "");
        const clientSlug = String(fm.client_slug ?? "");
        const total = roundEur(fm.total ?? 0);
        const reminderCount = Number(fm.reminder_count ?? 0) || 0;
        const plan = planDunningStep(openItem, reminderCount, total);
        const nextCount = reminderCount + 1;

        let recipient: string | undefined;
        if (clientSlug) {
          try {
            const contactPage = await brain.getPage(clientSlug);
            const cfm = contactPage.frontmatter as Record<string, unknown>;
            recipient = String(cfm.email ?? "") || undefined;
          } catch {
            /* handled below */
          }
        }
        if (!recipient) {
          return apiError("no_recipient_email", "Keine Empfänger-E-Mail", 400);
        }

        const mahnungLabels = ["Erste Mahnung", "Zweite Mahnung", "Dritte Mahnung"];
        const label = mahnungLabels[Math.min(nextCount - 1, 2)] || `${nextCount}. Mahnung`;
        const invoiceNumber = String(fm.invoice_number ?? body.invoiceSlug);
        const subject = `${label} – Rechnung ${invoiceNumber}`;
        const trackingId = generateTrackingId();
        const html = reminderMailHtml({
          label,
          client,
          invoiceNumber,
          invoiceTotal: total,
          paidSoFar: roundEur(openItem?.paid_amount ?? 0),
          feeAdded: plan.feeAdded,
          feeTotal: plan.feeTotal,
          openAmount: plan.openAmount,
          signature: settings?.anwaltName || settings?.kanzleiName || "",
        });

        // Firm SMTP, Resend as the fallback — the same channel as all other
        // client mail.
        const sent = await sendFirmMail(settings, { to: recipient, subject, html, trackingId });
        if (!sent.sent) {
          return apiError("send_failed", "Mahnung konnte nicht gesendet werden", 502);
        }
        void logTrackingEvent({
          trackingId,
          eventType: "sent",
          raw: {
            source: "invoice_reminder",
            route: "invoice.remind",
            recipient,
            brain_id: ctx.brainId,
            resend_id: sent.id ?? null,
            via: sent.via,
          },
        });

        const caseSlugs = Array.isArray(fm.case_slugs) ? (fm.case_slugs as unknown[]) : [];
        const outboundEntryId = await recordInvoiceOutbound(ctx.headers, {
          recipient,
          recipientName: client || recipient,
          caseSlug: caseSlugs.length > 0 ? String(caseSlugs[0]) : undefined,
          subject,
          sentBy: ctx.user.email ?? ctx.user.id,
          trackingId: sent.trackingId ?? trackingId,
          providerId: sent.id,
          notes: `${label} zu Rechnung ${invoiceNumber}, offener Betrag ${formatEur(plan.openAmount, "de")}`,
        });

        const sentAt = new Date().toISOString();
        const prevSent = Array.isArray(fm.reminder_sent_at) ? fm.reminder_sent_at : [];
        // Only the reminder bookkeeping — a merge, never the whole stored
        // frontmatter written back.
        await brain.updatePage({
          slug: body.invoiceSlug,
          frontmatter: {
            status: "overdue",
            reminder_count: nextCount,
            reminder_sent_at: [...prevSent, sentAt],
            reminder_fee: plan.feeAdded,
          },
        });

        // OPOS: level and fee move together with the letter.
        try {
          await applyDunningStep(ctx.headers, body.invoiceSlug, plan);
        } catch (err) {
          log.error(
            "[invoice-remind] opos update failed:",
            err instanceof Error ? err.message : String(err)
          );
        }

        return Response.json({
          ok: true,
          reminderCount: nextCount,
          level: plan.level,
          fee: plan.feeAdded,
          feeTotal: plan.feeTotal,
          newTotal: plan.openAmount,
          sentTo: recipient,
          outboundEntryId,
        });
      } catch (err) {
        log.error("[invoice-remind] failed:", err instanceof Error ? err.message : String(err));
        return apiError("send_failed", "Mahnung konnte nicht gesendet werden", 500);
      }
    });
  }
);
