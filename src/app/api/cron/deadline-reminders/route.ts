import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import nodemailer from "nodemailer";
import { createCronHandler } from "@/lib/api-handler";
import type { BrainPage } from "@/lib/types";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import { generateTrackingId, injectTracking, logTrackingEvent } from "@/lib/email/tracking";
import { createDeadlineNotification, createNotificationFailureNotification } from "@/lib/comments";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone } from "@/lib/whatsapp/types";
import { sendPushToUser } from "@/lib/push-send";
import { isVorfristReached } from "@/lib/legal/vorfrist";

export const dynamic = "force-dynamic";

interface DeadlineItem {
  title?: string;
  due_date?: string;
  date?: string;
  reminder_sent_at?: string;
  reminder_stages_sent?: number[];
  vorfrist_date?: string;
  vorfrist_reminder_sent_at?: string;
  is_notfrist?: boolean;
  erv_zustelldatum?: string;
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
  const identityStore = getWhatsAppIdentityStore();

  let brainsChecked = 0;
  let total = 0;
  let emailed = 0;
  let whatsapped = 0;
  let pushSent = 0;
  let inAppSent = 0;
  const errors: string[] = [];
  const failed: Array<{
    deadline_id: string;
    case_slug: string;
    channels: string[];
    reason: string;
  }> = [];

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    const pages = await listCasePages(brainId);
    if (pages.length === 0) continue;

    // P3-3: Send email to ALL recipients, not just the first one
    const emailRecipients = recipients.map((r) => r.email).filter((e): e is string => !!e);
    const toEmails =
      emailRecipients.length > 0 ? emailRecipients.join(", ") : (settings.smtpUser ?? "");

    // P3-1: Collect WhatsApp identities for this brain's orgs
    const orgIds = new Set<string>();
    for (const recipient of recipients) {
      if (recipient.orgId) orgIds.add(recipient.orgId);
    }
    const allIdentities: Array<{ userId: string; phone: string }> = [];
    for (const orgId of orgIds) {
      try {
        const identities = await identityStore.listByOrg(orgId);
        for (const id of identities) {
          if (id.phone && id.userId) {
            allIdentities.push({ userId: id.userId, phone: id.phone });
          }
        }
      } catch {
        // Non-blocking
      }
    }

    for (const page of pages) {
      const fm = page.frontmatter ?? {};
      const deadlines = Array.isArray(fm.deadlines) ? (fm.deadlines as DeadlineItem[]) : [];
      const due = deadlines
        .map((d) => {
          const dd = String(d.due_date ?? d.date ?? "");
          if (!dd) return null;
          const stage = nextDueStage(d, dd);
          // B3: Check Vorfrist separately — if Vorfrist is reached but
          // no vorfrist reminder has been sent yet, include it
          const vfReached =
            d.vorfrist_date && isVorfristReached(d.vorfrist_date) && !d.vorfrist_reminder_sent_at;
          if (stage === undefined && !vfReached) return null;
          return { d, dd, stage, vfReached: !!vfReached };
        })
        .filter(
          (
            x
          ): x is { d: DeadlineItem; dd: string; stage: number | undefined; vfReached: boolean } =>
            x !== null
        );

      if (due.length === 0) continue;
      total += due.length;

      const esc = (s: unknown) =>
        String(s).replace(
          /[&<>"']/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
        );
      const subject = `Fristen-Erinnerung — Akte ${esc(fm.case_number ?? page.slug)}`;
      const stageLabel = (stage: number | undefined, vfReached: boolean) =>
        vfReached
          ? "Vorfrist erreicht"
          : stage === 0
            ? "HEUTE fällig"
            : stage === 1
              ? "morgen fällig"
              : `in ${stage} Tagen fällig`;
      const trackingId = generateTrackingId();
      const rawHtml = `<p>Sehr geehrte/r ${esc(settings.anwaltName || "Anwalt")},</p>
<p>folgende Fristen stehen an:</p>
<ul>
${due.map(({ d, dd, stage, vfReached }) => `<li><strong>${esc(d.title ?? "Frist")}</strong> — ${esc(dd)} (${stageLabel(stage, vfReached)})${d.is_notfrist ? " <strong>[Notfrist — Vier-Augen-Kontrolle]</strong>" : ""}${d.erv_zustelldatum ? ` <em>[ERV-Zustellung: ${esc(d.erv_zustelldatum)}]</em>` : ""}</li>`).join("\n")}
</ul>
<p>Akte: ${esc(fm.case_number ?? page.slug)} — ${esc(fm.title ?? page.title ?? "")}</p>
<p>Subsumio Kanzlei-OS</p>`;
      const html = injectTracking(rawHtml, trackingId);

      try {
        let notificationSent = false;

        // B2: Send email only when SMTP is configured — to ALL recipients
        const emailChannels: string[] = [];
        if (transporter && toEmails) {
          try {
            await transporter.sendMail({ from: fromAddr, to: toEmails, subject, html });
            notificationSent = true;
            emailed++;
            emailChannels.push("email");

            // Log tracking event for the outbound email
            void logTrackingEvent({
              trackingId,
              eventType: "delivered",
              raw: { source: "smtp", route: "deadline-reminders", recipients: toEmails },
            });
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            errors.push(`Email deadline reminder failed: ${reason}`);
            for (const { d, dd } of due) {
              failed.push({
                deadline_id: `${page.slug}_${d.title ?? "Frist"}_${dd}`,
                case_slug: page.slug,
                channels: ["email"],
                reason,
              });
              for (const recipient of recipients) {
                await createNotificationFailureNotification({
                  userId: recipient.id,
                  brainId,
                  caseSlug: page.slug,
                  caseTitle: String(fm.case_number ?? page.title ?? page.slug),
                  deadlineTitle: d.title ?? "Frist",
                  deadlineDate: dd,
                  channels: ["email"],
                  reason,
                });
              }
            }
          }
        } else if (!smtpConfigured) {
          // SMTP not configured at all — visible warning per deadline
          for (const { d, dd } of due) {
            const reason = "smtp_not_configured";
            failed.push({
              deadline_id: `${page.slug}_${d.title ?? "Frist"}_${dd}`,
              case_slug: page.slug,
              channels: ["email"],
              reason,
            });
          }
        }

        // P3-1: Send WhatsApp reminder to all recipients with a linked identity
        const waBodyLines = [
          "⚖️ Fristen-Erinnerung:",
          ...due.map(
            ({ d, dd, stage, vfReached }) =>
              `• ${d.title ?? "Frist"} — ${dd} (${stageLabel(stage, vfReached)})${d.is_notfrist ? " [Notfrist]" : ""}${d.erv_zustelldatum ? ` [ERV: ${d.erv_zustelldatum}]` : ""}`
          ),
          `Akte: ${fm.case_number ?? page.slug}`,
          "",
          "Bitte rechtzeitig prüfen.",
        ];
        const waBody = waBodyLines.join("\n");
        let waSentAny = false;
        let waFailedAny = false;
        for (const recipient of recipients) {
          const identityEntry = allIdentities.find((id) => id.userId === recipient.id);
          if (!identityEntry) continue;
          try {
            const waResult = await sendProactiveMessage({
              to: normalizePhone(identityEntry.phone),
              brainId,
              scope: "deadline_alert",
              freeform: waBody,
              urgent: true,
            });
            if (waResult.sent) {
              notificationSent = true;
              waSentAny = true;
            } else {
              waFailedAny = true;
              errors.push(
                `WhatsApp deadline reminder blocked for ${recipient.id}: ${waResult.decision.reason}`
              );
            }
          } catch (err) {
            waFailedAny = true;
            errors.push(
              `WhatsApp deadline reminder failed for ${recipient.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        if (waSentAny) whatsapped++;
        if (waFailedAny) {
          for (const { d, dd } of due) {
            failed.push({
              deadline_id: `${page.slug}_${d.title ?? "Frist"}_${dd}`,
              case_slug: page.slug,
              channels: ["whatsapp"],
              reason: "send_failed_or_blocked",
            });
          }
        }

        // B2: Always create in-app notifications (dual-channel when SMTP is on, fallback when off)
        for (const recipient of recipients) {
          for (const { dd, vfReached } of due) {
            const remaining = daysUntil(dd);
            await createDeadlineNotification({
              userId: recipient.id,
              brainId,
              caseSlug: page.slug,
              caseTitle: String(fm.case_number ?? page.title ?? page.slug),
              deadlineDate: dd,
              daysRemaining: remaining,
              isOverdue: remaining < 0,
              isVorfrist: vfReached,
            });
          }
          notificationSent = true;
          inAppSent++;
        }

        // P1-4: Send push notification to all recipients with registered devices
        const pushTitle = `⚖️ Frist: ${due[0].d.title ?? "Frist"} ${stageLabel(due[0].stage, due[0].vfReached)}`;
        const pushBody = `Akte ${fm.case_number ?? page.slug} — ${due.length} Frist(en) anstehend`;
        let pushSentAny = false;
        for (const recipient of recipients) {
          try {
            const pushed = await sendPushToUser(recipient.id, {
              title: pushTitle,
              body: pushBody,
              data: { case_slug: page.slug, type: "deadline_reminder" },
            });
            if (pushed > 0) {
              notificationSent = true;
              pushSentAny = true;
            }
          } catch (err) {
            errors.push(
              `Push notification failed for ${recipient.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        if (pushSentAny) pushSent++;

        // FIX: Only mark stages as sent when at least one notification
        // was actually delivered. Otherwise the reminder is silently lost.
        if (!notificationSent) continue;

        const stageByDeadline = new Map(due.map(({ d, stage }) => [d, stage]));
        const vfByDeadline = new Map(due.map(({ d, vfReached }) => [d, vfReached]));
        const nowIso = now.toISOString();
        const updatedDeadlines = deadlines.map((d) => {
          const stage = stageByDeadline.get(d);
          const vf = vfByDeadline.get(d);
          return {
            ...d,
            reminder_sent_at: stage !== undefined ? nowIso : d.reminder_sent_at,
            reminder_stages_sent:
              stage !== undefined
                ? [...(d.reminder_stages_sent ?? []), stage]
                : d.reminder_stages_sent,
            vorfrist_reminder_sent_at: vf ? nowIso : d.vorfrist_reminder_sent_at,
          };
        });

        await updatePageDeadlines(brainId, page.slug, { ...fm, deadlines: updatedDeadlines });
      } catch (err) {
        errors.push(String(err instanceof Error ? err.message : err));
      }
    }
  }

  return NextResponse.json({
    ok: true,
    brains_checked: brainsChecked,
    total,
    emailed,
    whatsapped,
    push_sent: pushSent,
    in_app: inAppSent,
    smtp_configured: smtpConfigured,
    failed: failed.length > 0 ? failed : undefined,
    errors: errors.length > 0 ? errors : undefined,
  });
});
