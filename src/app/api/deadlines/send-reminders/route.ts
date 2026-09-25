import nodemailer from "nodemailer";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { loadFristenReadModel, DEADLINE_SOURCES, type Frist } from "@/lib/fristen-read-model";
import { isSmtpConfigured, loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { createDeadlineNotification } from "@/lib/comments";
import { daysUntil } from "@/lib/deadline-reminders";
import { zonedDateString } from "@/lib/datetime";
import { logger } from "@/lib/logger";

const log = logger("api/deadlines/send-reminders");

export const dynamic = "force-dynamic";

/** Open deadlines due within this many days (overdue included) are listed. */
const WINDOW_DAYS = 7;

function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

/**
 * "Erinnerungen jetzt senden" from the Fristen page.
 *
 * A signed-in firm member asks for a reminder NOW: this route reads the
 * deadlines of the caller's own firm (session headers → own brain only) and
 * sends the list to the CALLER — in-app, plus e-mail when the firm has SMTP.
 * It never sends to other people and never marks reminder stages as sent, so
 * the scheduled firm-wide reminders keep running unchanged. Cron routes are
 * not callable from the browser (they require the cron secret).
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: () => ({
      action: "notifications.deadline_batch_create" as const,
      entityType: "deadline",
      details: { trigger: "manual" },
    }),
  },
  async (ctx) => {
    const now = new Date();
    const heute = zonedDateString(now);
    let fristen: Frist[];
    let partial = false;
    try {
      const model = await loadFristenReadModel(ctx.headers, { heute });
      fristen = model.fristen;
      partial = model.failedSources.some((s) => DEADLINE_SOURCES.includes(s));
    } catch (err) {
      log.error("deadlines unreadable:", err instanceof Error ? err.message : String(err));
      return apiError("deadlines_unavailable", "Fristen konnten nicht geladen werden", 503);
    }

    const due = fristen
      .filter((f) => f.status !== "done" && f.review_status !== "rejected")
      .map((f) => ({ f, days: daysUntil(f.due_date, now) }))
      .filter(({ days }) => days <= WINDOW_DAYS)
      .sort((a, b) => a.f.due_date.localeCompare(b.f.due_date));

    for (const { f, days } of due) {
      await createDeadlineNotification({
        userId: ctx.user.id,
        brainId: ctx.brainId,
        caseSlug: f.case_slug,
        caseTitle: f.case_title ?? f.title,
        deadlineDate: f.due_date,
        daysRemaining: days,
        isOverdue: days < 0,
      });
    }

    let smtpConfigured = false;
    let emailed = false;
    if (due.length > 0 && ctx.user.email) {
      try {
        const settings = await loadKanzleiSettingsForBrain(ctx.brainId);
        smtpConfigured = isSmtpConfigured(settings);
        if (smtpConfigured) {
          const transporter = nodemailer.createTransport({
            host: settings.smtpHost!,
            port: parseInt(settings.smtpPort ?? "587", 10),
            secure: settings.smtpSecure ?? false,
            auth: { user: settings.smtpUser!, pass: settings.smtpPassword! },
          });
          const html = `<p>Folgende Fristen stehen in den nächsten ${WINDOW_DAYS} Tagen an oder sind überfällig:</p>
<ul>
${due
  .map(
    ({ f, days }) =>
      `<li><strong>${esc(f.title)}</strong> — ${esc(f.due_date)} (${days < 0 ? "überfällig" : days === 0 ? "heute" : `in ${days} Tagen`})${f.is_notfrist ? " <strong>[Notfrist]</strong>" : ""}${f.case_title ? ` — Akte ${esc(f.case_title)}` : ""}</li>`
  )
  .join("\n")}
</ul>
${partial ? "<p><strong>Achtung: Nicht alle Fristenquellen konnten gelesen werden — die Liste ist möglicherweise unvollständig.</strong></p>" : ""}
<p>Subsumio Kanzlei-OS</p>`;
          await transporter.sendMail({
            from: settings.emailFrom ?? settings.smtpUser ?? "noreply@subsumio.local",
            to: ctx.user.email,
            subject: `Fristen-Erinnerung — ${due.length} Frist(en)`,
            html,
          });
          emailed = true;
        }
      } catch (err) {
        log.error("reminder mail failed:", err instanceof Error ? err.message : String(err));
        return apiError("mail_failed", "Die Erinnerungs-E-Mail konnte nicht versendet werden", 502);
      }
    }

    return apiSuccess({ sentCount: due.length, emailed, smtpConfigured, partial });
  }
);
