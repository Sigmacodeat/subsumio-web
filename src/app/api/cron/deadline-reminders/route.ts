import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import nodemailer from "nodemailer";
import { createCronHandler } from "@/lib/api-handler";
import type { BrainPage } from "@/lib/types";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import { generateTrackingId, injectTracking, logTrackingEvent } from "@/lib/email/tracking";
import { createDeadlineNotification } from "@/lib/comments";

export const dynamic = "force-dynamic";

interface DeadlineItem {
  title?: string;
  due_date?: string;
  date?: string;
  reminder_sent_at?: string;
  reminder_stages_sent?: number[];
}

// Gestaffelte Eskalation statt einer einzelnen "irgendwann in 3 Tagen"-Mail:
// je näher die Frist rückt, desto häufiger erinnert das System.
const REMINDER_STAGES_DAYS = [7, 3, 1, 0] as const;

async function listCasePages(brainId: string): Promise<BrainPage[]> {
  try {
    // Subsumio: was type=case — a page type nothing in this codebase
    // writes (same bug class as the daily-briefing cron, fixed earlier in
    // this followup pass). Real case pages are typed "legal_case"
    // everywhere else (cron/deadlines.ts, matter-context.ts, import-kanzlei,
    // bea filing). This cron was silently scanning an empty/wrong page set.
    const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_case&limit=1000`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function updatePageDeadlines(
  brainId: string,
  slug: string,
  fm: Record<string, unknown>
): Promise<void> {
  const headers = engineHeadersForBrain(brainId);
  // The engine has no PATCH/If-Match route — merge-update overlays just the
  // frontmatter keys we send. Cron reminder-state writes are idempotent
  // (reminder_sent flags), so last-writer-wins is fine here.
  try {
    await enginePatchPage(headers, { slug, frontmatter: fm }, { timeoutMs: 30_000 });
  } catch {
    // Einzelne Update-Fehler dürfen Cron nicht abbrechen
  }
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const settings = await loadKanzleiSettings();
  const smtpConfigured = !!(settings.smtpHost && settings.smtpUser && settings.smtpPassword);

  // B2: Don't fail hard when SMTP isn't configured — fall back to in-app notifications only
  const transporter = smtpConfigured
    ? nodemailer.createTransport({
        host: settings.smtpHost!,
        port: parseInt(settings.smtpPort ?? "587", 10),
        secure: settings.smtpSecure ?? false,
        auth: { user: settings.smtpUser!, pass: settings.smtpPassword! },
      })
    : null;

  const fromAddr = settings.emailFrom ?? settings.smtpUser ?? "noreply@subsumio.local";
  const now = new Date();

  function daysUntil(dateStr: string): number {
    const target = new Date(`${dateStr}T12:00:00Z`);
    const diffMs = target.getTime() - now.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  /** Höchste fällige, noch nicht versendete Eskalationsstufe für eine Frist. */
  function nextDueStage(d: DeadlineItem, dd: string): number | undefined {
    const remaining = daysUntil(dd);
    if (remaining < 0) return undefined;
    const sent = new Set(d.reminder_stages_sent ?? []);
    const due = REMINDER_STAGES_DAYS.filter((stage) => remaining <= stage && !sent.has(stage));
    return due.length > 0 ? Math.min(...due) : undefined;
  }

  // Brain → Empfänger
  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let totalSent = 0;
  const errors: string[] = [];

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    const pages = await listCasePages(brainId);
    if (pages.length === 0) continue;

    const toEmail = recipients[0]?.email ?? settings.smtpUser;

    for (const page of pages) {
      const fm = page.frontmatter ?? {};
      const deadlines = Array.isArray(fm.deadlines) ? (fm.deadlines as DeadlineItem[]) : [];
      const due = deadlines
        .map((d) => {
          const dd = String(d.due_date ?? d.date ?? "");
          if (!dd) return null;
          const stage = nextDueStage(d, dd);
          return stage === undefined ? null : { d, dd, stage };
        })
        .filter((x): x is { d: DeadlineItem; dd: string; stage: number } => x !== null);

      if (due.length === 0) continue;

      const esc = (s: unknown) =>
        String(s).replace(
          /[&<>"']/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
        );
      const subject = `Fristen-Erinnerung — Akte ${esc(fm.case_number ?? page.slug)}`;
      const stageLabel = (stage: number) =>
        stage === 0 ? "HEUTE fällig" : stage === 1 ? "morgen fällig" : `in ${stage} Tagen fällig`;
      const trackingId = generateTrackingId();
      const rawHtml = `<p>Sehr geehrte/r ${esc(settings.anwaltName || "Anwalt")},</p>
<p>folgende Fristen stehen an:</p>
<ul>
${due.map(({ d, dd, stage }) => `<li><strong>${esc(d.title ?? "Frist")}</strong> — ${esc(dd)} (${stageLabel(stage)})</li>`).join("\n")}
</ul>
<p>Akte: ${esc(fm.case_number ?? page.slug)} — ${esc(fm.title ?? page.title ?? "")}</p>
<p>Subsumio Kanzlei-OS</p>`;
      const html = injectTracking(rawHtml, trackingId);

      try {
        let notificationSent = false;

        // B2: Send email only when SMTP is configured
        if (transporter && toEmail) {
          await transporter.sendMail({ from: fromAddr, to: toEmail, subject, html });
          notificationSent = true;

          // Log tracking event for the outbound email
          void logTrackingEvent({
            trackingId,
            eventType: "delivered",
            raw: { source: "smtp", route: "deadline-reminders", recipient: toEmail },
          });
        }

        // B2: Always create in-app notifications (dual-channel when SMTP is on, fallback when off)
        for (const recipient of recipients) {
          for (const { dd } of due) {
            const remaining = daysUntil(dd);
            await createDeadlineNotification({
              userId: recipient.id,
              brainId,
              caseSlug: page.slug,
              caseTitle: String(fm.case_number ?? page.title ?? page.slug),
              deadlineDate: dd,
              daysRemaining: remaining,
              isOverdue: remaining < 0,
            });
          }
          notificationSent = true;
        }

        // FIX: Only mark stages as sent when at least one notification
        // was actually delivered. Otherwise the reminder is silently lost.
        if (!notificationSent) continue;

        const stageByDeadline = new Map(due.map(({ d, stage }) => [d, stage]));
        const updatedDeadlines = deadlines.map((d) => {
          const stage = stageByDeadline.get(d);
          if (stage === undefined) return d;
          return {
            ...d,
            reminder_sent_at: now.toISOString(),
            reminder_stages_sent: [...(d.reminder_stages_sent ?? []), stage],
          };
        });

        await updatePageDeadlines(brainId, page.slug, { ...fm, deadlines: updatedDeadlines });
        totalSent += due.length;
      } catch (err) {
        errors.push(String(err instanceof Error ? err.message : err));
      }
    }
  }

  return NextResponse.json({
    ok: true,
    brains_checked: brainsChecked,
    sent: totalSent,
    smtp_configured: smtpConfigured,
    errors: errors.length > 0 ? errors : undefined,
  });
});
