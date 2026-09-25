import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { DEFAULT_KANZLEI_SETTINGS, type KanzleiSettings } from "@/lib/kanzlei-settings";
import { isSmtpConfigured, loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import nodemailer from "nodemailer";
import { createCronHandler } from "@/lib/api-handler";
import {
  fetchAllPagesStrict,
  fetchPages,
  getRecipientsByBrain,
  type EnginePage,
} from "@/lib/cron-utils";
import { generateTrackingId, injectTracking, logTrackingEvent } from "@/lib/email/tracking";
import {
  createDeadlineNotification,
  createIntakeStaleNotification,
  createNotificationFailureNotification,
} from "@/lib/comments";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone } from "@/lib/whatsapp/types";
import { sendPushToUser } from "@/lib/push-send";
import {
  annotateDelegations,
  collectDueReminders,
  markCaseDeadlines,
  parseReminderStages,
  REMINDER_STAGES_DAYS,
  sentFields,
  UNCONFIRMED_AI_NOTICE,
  type DueReminder,
  type ReminderDeadline,
} from "@/lib/deadline-reminders";
import type { AbsenceRecord } from "@/lib/absence";

export const dynamic = "force-dynamic";

/** Stable id of one reminder, for the failure report. */
function reminderId(item: DueReminder): string {
  return item.ref.kind === "page"
    ? item.ref.slug
    : `${item.ref.caseSlug}_${item.title}_${item.dueDate}`;
}

async function updateDeadlineRecords(
  brainId: string,
  groupItems: DueReminder[],
  nowIso: string,
  stages: readonly number[] = REMINDER_STAGES_DAYS
): Promise<void> {
  const headers = engineHeadersForBrain(brainId);
  // Standalone deadline records: only the reminder fields change.
  for (const item of groupItems) {
    if (item.ref.kind !== "page") continue;
    try {
      const res = await fetch(
        `${ENGINE_URL}/api/pages/${item.ref.slug.split("/").map(encodeURIComponent).join("/")}`,
        { headers, signal: AbortSignal.timeout(15_000) }
      );
      if (!res.ok) continue;
      const page = (await res.json()) as { frontmatter?: ReminderDeadline };
      await enginePatchPage(
        headers,
        {
          slug: item.ref.slug,
          frontmatter: sentFields(page.frontmatter ?? {}, item, nowIso, stages),
        },
        { timeoutMs: 30_000 }
      );
    } catch {
      // Einzelne Update-Fehler dürfen Cron nicht abbrechen
    }
  }
  // Deadlines inside a matter: re-read the matter and write only its deadline list,
  // so documents, time entries or edits saved since are not overwritten.
  const caseItems = groupItems.filter((i) => i.ref.kind === "case");
  const caseSlug = caseItems[0]?.ref.kind === "case" ? caseItems[0].ref.caseSlug : undefined;
  if (!caseSlug) return;
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${caseSlug.split("/").map(encodeURIComponent).join("/")}`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return;
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
    const current = Array.isArray(page.frontmatter?.deadlines)
      ? (page.frontmatter.deadlines as ReminderDeadline[])
      : [];
    const { deadlines, changed } = markCaseDeadlines(current, caseItems, nowIso, stages);
    if (changed) {
      await enginePatchPage(
        headers,
        { slug: caseSlug, frontmatter: { deadlines } },
        { timeoutMs: 30_000 }
      );
    }
  } catch {
    // Einzelne Update-Fehler dürfen Cron nicht abbrechen
  }
}

/**
 * Staged Fristen reminders (email / WhatsApp / push / in-app) for every firm.
 *
 * SMTP comes from EACH firm's own Kanzlei settings, read server-side from its
 * brain (loadKanzleiSettingsForBrain). The browser settings loader used here
 * before reached the engine without API key or tenant header, got a 401 and
 * fell back to defaults — no reminder email was ever sent.
 *
 * Deadline data is read completely and strictly: a failed read is an error,
 * never "no deadlines". Any hard error (unreadable firm data, settings or a
 * failed email/notification) turns the response into HTTP 500 so the cron
 * log shows the failure; the JSON body keeps the full report. WhatsApp/push
 * problems are reported as warnings — in-app is the guaranteed channel.
 */
export const GET = createCronHandler(async (_req: NextRequest) => {
  const now = new Date();

  // Brain → Empfänger
  const recipientsByBrain = await getRecipientsByBrain();
  const identityStore = getWhatsAppIdentityStore();

  let brainsChecked = 0;
  let total = 0;
  let emailed = 0;
  let whatsapped = 0;
  let pushSent = 0;
  let inAppSent = 0;
  let staleIntakes = 0;
  let smtpBrains = 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  const failed: Array<{
    deadline_id: string;
    case_slug: string;
    channels: string[];
    reason: string;
  }> = [];

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    let casePages: EnginePage[];
    let deadlinePages: EnginePage[];
    let followUpPages: EnginePage[];
    let absencePages: EnginePage[];
    let intakePages: EnginePage[];
    try {
      [casePages, deadlinePages, followUpPages, absencePages, intakePages] = await Promise.all([
        fetchAllPagesStrict(brainId, "legal_case"),
        fetchAllPagesStrict(brainId, "legal_deadline"),
        fetchAllPagesStrict(brainId, "legal_follow_up"),
        fetchPages(brainId, "absence_record", 10_000),
        fetchPages(brainId, "intake_request", 10_000),
      ]);
    } catch (err) {
      errors.push(
        `Deadline data unreadable for brain ${brainId}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    // Erstanfragen verlieren Mandate, wenn sie liegen — offene Intakes
    // älter als 24h eskalieren einmalig (deterministische ID) an alle.
    const STALE_INTAKE_MS = 24 * 60 * 60 * 1000;
    const OPEN_INTAKE_STATUS = new Set(["new", "needs_info", "conflict_check", "accepted"]);
    for (const page of intakePages) {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      if (!OPEN_INTAKE_STATUS.has(String(fm.status ?? "new"))) continue;
      const created = new Date(String(fm.created_at ?? page.created_at ?? "")).getTime();
      if (!Number.isFinite(created) || now.getTime() - created < STALE_INTAKE_MS) continue;
      staleIntakes++;
      const hoursOpen = Math.floor((now.getTime() - created) / 3_600_000);
      for (const recipient of recipients) {
        try {
          await createIntakeStaleNotification({
            userId: recipient.id,
            brainId,
            intakeSlug: page.slug,
            clientName: typeof fm.client_name === "string" ? fm.client_name : undefined,
            hoursOpen,
          });
        } catch (err) {
          errors.push(
            `Stale-intake notification failed for ${recipient.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // This firm's own SMTP settings. Unreadable settings are an error, but the
    // reminders still go out in-app (and via WhatsApp/push) below.
    let settings: KanzleiSettings = DEFAULT_KANZLEI_SETTINGS;
    let settingsReadable = true;
    try {
      settings = await loadKanzleiSettingsForBrain(brainId);
    } catch (err) {
      settingsReadable = false;
      errors.push(
        `Kanzlei settings unreadable for brain ${brainId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Firm-configured reminder stages ("7,3,1,0"); unreadable → safe default.
    const reminderStages = parseReminderStages(settings.deadlineReminderStages);

    const groups = collectDueReminders(
      casePages,
      deadlinePages,
      now,
      followUpPages,
      reminderStages
    );
    if (groups.length === 0) continue;

    const smtpConfigured = isSmtpConfigured(settings);
    if (smtpConfigured) smtpBrains++;

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

    // Vertretungsregelung: die Erinnerung geht an alle Kanzlei-Mitglieder —
    // was fehlte, ist die Zurechnung. Ist die verantwortliche Person der
    // Akte abwesend, nennt die Nachricht die Vertretung mit Rückkehrdatum.
    const responsibleByCase = new Map<string, string>();
    for (const c of casePages) {
      const lawyer = c.frontmatter?.own_lawyer_name;
      if (typeof lawyer === "string" && lawyer.trim()) {
        responsibleByCase.set(c.slug, lawyer.trim());
      }
    }
    const absenceRecords = absencePages
      .map((p) => p.frontmatter as unknown as AbsenceRecord | undefined)
      .filter((r): r is AbsenceRecord => Boolean(r?.user_email));
    annotateDelegations(groups, responsibleByCase, absenceRecords, now);

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

    for (const group of groups) {
      const due = group.items;
      const caseSlugForNotif = group.caseSlug ?? "";
      total += due.length;

      const esc = (s: unknown) =>
        String(s).replace(
          /[&<>"']/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
        );
      const subject = group.caseSlug
        ? `Fristen-Erinnerung — Akte ${esc(group.caseLabel)}`
        : "Fristen-Erinnerung — Fristen ohne Akte";
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
${due.map((i) => `<li>${i.isFollowUp ? "<em>[Wiedervorlage]</em> " : ""}<strong>${esc(i.title)}</strong> — ${esc(i.dueDate)} (${stageLabel(i.stage, i.vorfristReached)})${i.isNotfrist ? " <strong>[Notfrist — Vier-Augen-Kontrolle]</strong>" : ""}${i.unreviewedAi ? ` <strong>[${UNCONFIRMED_AI_NOTICE}]</strong>` : ""}${i.ervZustelldatum ? ` <em>[ERV-Zustellung: ${esc(i.ervZustelldatum)}]</em>` : ""}${i.delegation ? ` <em>[Vertretung: ${esc(i.delegation.delegateName)} für ${esc(i.delegation.responsible)}]</em>` : ""}</li>`).join("\n")}
</ul>
${group.delegation ? `<p><strong>Vertretung:</strong> ${esc(group.delegation.delegateName)} vertritt ${esc(group.delegation.responsible)} (abwesend bis ${esc(group.delegation.until)}).</p>` : ""}
<p>${group.caseSlug ? `Akte: ${esc(group.caseLabel)} — ${esc(group.caseTitle ?? "")}` : "Diese Fristen sind keiner Akte zugeordnet."}</p>
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
              eventType: "sent",
              raw: { source: "smtp", route: "deadline-reminders", recipients: toEmails },
            });
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            errors.push(`Email deadline reminder failed: ${reason}`);
            for (const item of due) {
              failed.push({
                deadline_id: reminderId(item),
                case_slug: caseSlugForNotif,
                channels: ["email"],
                reason,
              });
              for (const recipient of recipients) {
                await createNotificationFailureNotification({
                  userId: recipient.id,
                  brainId,
                  caseSlug: group.caseSlug,
                  caseTitle: group.caseLabel,
                  deadlineTitle: item.title,
                  deadlineDate: item.dueDate,
                  channels: ["email"],
                  reason,
                });
              }
            }
          }
        } else if (!smtpConfigured) {
          // SMTP not configured at all — visible warning per deadline
          for (const item of due) {
            failed.push({
              deadline_id: reminderId(item),
              case_slug: caseSlugForNotif,
              channels: ["email"],
              reason: settingsReadable ? "smtp_not_configured" : "settings_unavailable",
            });
          }
        }

        // P3-1: Send WhatsApp reminder to all recipients with a linked identity
        const waBodyLines = [
          "⚖️ Fristen-Erinnerung:",
          ...due.map(
            (i) =>
              `• ${i.isFollowUp ? "WV: " : ""}${i.title} — ${i.dueDate} (${stageLabel(i.stage, i.vorfristReached)})${i.isNotfrist ? " [Notfrist]" : ""}${i.unreviewedAi ? ` [${UNCONFIRMED_AI_NOTICE}]` : ""}${i.ervZustelldatum ? ` [ERV: ${i.ervZustelldatum}]` : ""}${i.delegation ? ` [Vertretung: ${i.delegation.delegateName}]` : ""}`
          ),
          `Akte: ${group.caseLabel}`,
          ...(group.delegation
            ? [
                `Vertretung: ${group.delegation.delegateName} vertritt ${group.delegation.responsible} (bis ${group.delegation.until})`,
              ]
            : []),
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
              warnings.push(
                `WhatsApp deadline reminder blocked for ${recipient.id}: ${waResult.decision.reason}`
              );
            }
          } catch (err) {
            waFailedAny = true;
            warnings.push(
              `WhatsApp deadline reminder failed for ${recipient.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        if (waSentAny) whatsapped++;
        if (waFailedAny) {
          for (const item of due) {
            failed.push({
              deadline_id: reminderId(item),
              case_slug: caseSlugForNotif,
              channels: ["whatsapp"],
              reason: "send_failed_or_blocked",
            });
          }
        }

        // B2: Always create in-app notifications (dual-channel when SMTP is on, fallback when off)
        const delegationNote = group.delegation
          ? `Vertretung: ${group.delegation.delegateName} vertritt ${group.delegation.responsible} (bis ${group.delegation.until})`
          : undefined;
        for (const recipient of recipients) {
          for (const item of due) {
            await createDeadlineNotification({
              userId: recipient.id,
              brainId,
              caseSlug: group.caseSlug,
              caseTitle: group.caseLabel,
              deadlineDate: item.dueDate,
              daysRemaining: item.daysRemaining,
              isOverdue: false,
              isVorfrist: item.vorfristReached,
              delegation: item.delegation
                ? `Vertretung: ${item.delegation.delegateName} vertritt ${item.delegation.responsible} (bis ${item.delegation.until})`
                : delegationNote,
            });
          }
          notificationSent = true;
          inAppSent++;
        }

        // P1-4: Send push notification to all recipients with registered devices
        const pushTitle = due[0].isFollowUp
          ? `📌 Wiedervorlage: ${due[0].title} ${stageLabel(due[0].stage, due[0].vorfristReached)}`
          : `⚖️ Frist: ${due[0].title} ${stageLabel(due[0].stage, due[0].vorfristReached)}`;
        const unconfirmed = due.filter((i) => i.unreviewedAi).length;
        const pushBody = `${group.caseSlug ? `Akte ${group.caseLabel}` : "Ohne Akte"} — ${due.length} Frist(en) anstehend${unconfirmed ? `, davon ${unconfirmed} unbestätigte KI-Vorschläge – bitte prüfen` : ""}${delegationNote ? ` · ${delegationNote}` : ""}`;
        let pushSentAny = false;
        for (const recipient of recipients) {
          try {
            const pushed = await sendPushToUser(recipient.id, {
              title: pushTitle,
              body: pushBody,
              data: { case_slug: caseSlugForNotif, type: "deadline_reminder" },
            });
            if (pushed > 0) {
              notificationSent = true;
              pushSentAny = true;
            }
          } catch (err) {
            warnings.push(
              `Push notification failed for ${recipient.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        if (pushSentAny) pushSent++;

        // FIX: Only mark stages as sent when at least one notification
        // was actually delivered. Otherwise the reminder is silently lost.
        if (!notificationSent) continue;

        await updateDeadlineRecords(brainId, due, now.toISOString(), reminderStages);
      } catch (err) {
        errors.push(String(err instanceof Error ? err.message : err));
      }
    }
  }

  const ok = errors.length === 0;
  return NextResponse.json(
    {
      ok,
      brains_checked: brainsChecked,
      total,
      emailed,
      whatsapped,
      push_sent: pushSent,
      in_app: inAppSent,
      stale_intakes: staleIntakes,
      // Per firm now: true when at least one firm with due reminders has SMTP.
      smtp_configured: smtpBrains > 0,
      smtp_configured_brains: smtpBrains,
      failed: failed.length > 0 ? failed : undefined,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    { status: ok ? 200 : 500 }
  );
});
