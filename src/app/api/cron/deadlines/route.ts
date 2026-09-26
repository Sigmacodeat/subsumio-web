import { NextRequest } from "next/server";
import { sendMail } from "@/lib/mail";
import { computeDeadlineStatus } from "@/lib/legal-deadlines";
import { createCronHandler } from "@/lib/api-handler";
import {
  activeStaffRecipients,
  fetchAllPagesStrict,
  getRecipientsByBrain,
  createDailyDedup,
  createKeyedDedup,
  matterPermissionsBySlug,
  mayReceiveMatterNotice,
  mayReceiveMatterNoticeAnonymously,
  excludeDemoPages,
} from "@/lib/cron-utils";
import type { MatterPermissions } from "@/lib/matter-access";
import type { User } from "@/lib/auth/store";
import { isQuietDay, notfristEscalationKey } from "@/lib/deadline-notify";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { loadAllowedSenders } from "@/lib/whatsapp/verify";
import { env } from "@/lib/env";
import type { WhatsAppSenderBinding, WhatsAppTemplateMessage } from "@/lib/whatsapp/types";
import { syncPipelineDeadlines } from "@/lib/legal/pipeline-sync";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";

import { logger } from "@/lib/logger";
const log = logger("api/cron/deadlines");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/deadlines — täglicher Fristen-Digest per E-Mail.
 *
 * Läuft als supercronic Cron (Netcup) oder manuell:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/deadlines
 *
 * Pro Brain (Kanzlei): sammelt Fristen aus legal_case-Frontmattern und
 * legal_deadline-Seiten, filtert auf überfällig / kritisch (≤3 Tage) /
 * bald fällig (≤7 Tage) und schickt jedem aktiven Kanzlei-Mitarbeiter einen
 * eigenen Digest — nur mit Fristen der Akten, die er sehen darf (Sichtbarkeit,
 * Aktenteam, Freigaben, Ethical Wall). Mandantenzugänge erhalten keinen.
 * Dedupe: maximal eine Mail pro Brain pro Kalendertag (Postgres-Log;
 * ohne DB — Dev-Modus — wird ohne Dedupe gesendet).
 */

interface DeadlineItem {
  title: string;
  dueDate: string;
  status: "overdue" | "critical" | "warning" | "vorfrist";
  caseTitle?: string;
  /** Matter the deadline belongs to — decides who may be told about it. */
  caseSlug?: string;
  law?: string;
  vorfristDate?: string;
  /** Notfrist (statutory, non-extendable) — escalated separately when overdue. */
  isNotfrist?: boolean;
}

function classify(
  dueDate: string,
  doneFlag: unknown,
  vorfristDate?: string
): DeadlineItem["status"] | null {
  // Closed statuses never enter the digest — a cancelled deadline is not
  // "overdue" (computeDeadlineStatus only knows "done" as terminal).
  if (
    typeof doneFlag === "string" &&
    /^(done|erledigt|completed|abgeschlossen|cancelled|storniert|tombstoned)$/i.test(doneFlag)
  )
    return null;
  const status = computeDeadlineStatus(
    dueDate,
    typeof doneFlag === "string" ? doneFlag : undefined,
    vorfristDate
  );
  if (
    status === "overdue" ||
    status === "critical" ||
    status === "warning" ||
    status === "vorfrist"
  )
    return status;
  return null;
}

async function collectDeadlines(
  brainId: string
): Promise<{ items: DeadlineItem[]; permissions: Map<string, MatterPermissions> }> {
  const items: DeadlineItem[] = [];

  // Complete and strict: a failed read throws (the run reports an error)
  // instead of a truncated list that silently leaves deadlines out.
  const [cases, deadlinePages] = await Promise.all([
    fetchAllPagesStrict(brainId, "legal_case").then(excludeDemoPages),
    fetchAllPagesStrict(brainId, "legal_deadline").then(excludeDemoPages),
  ]);

  // 1. Fristen aus Akten-Frontmattern (legal_case → frontmatter.deadlines[])
  for (const page of cases) {
    const fm = page.frontmatter ?? {};
    const deadlines = Array.isArray(fm.deadlines) ? fm.deadlines : [];
    for (const raw of deadlines) {
      if (!raw || typeof raw !== "object") continue;
      const d = raw as Record<string, unknown>;
      const dueDate = String(d.due_date ?? d.date ?? "");
      if (!dueDate) continue;
      const vfDate = d.vorfrist_date ? String(d.vorfrist_date) : undefined;
      const status = classify(dueDate, d.status, vfDate);
      if (!status) continue;
      items.push({
        title: String(d.title ?? "Frist"),
        dueDate: dueDate.slice(0, 10),
        status,
        caseTitle: page.title,
        caseSlug: page.slug,
        law: d.law ? String(d.law) : undefined,
        vorfristDate: vfDate,
        isNotfrist: d.is_notfrist === true,
      });
    }
  }

  // 2. Eigenständige legal_deadline-Seiten
  for (const page of deadlinePages) {
    const fm = page.frontmatter ?? {};
    const dueDate = String(fm.due_date ?? fm.date ?? fm.deadline_date ?? "");
    if (!dueDate) continue;
    const vfDate = fm.vorfrist_date ? String(fm.vorfrist_date) : undefined;
    const status = classify(dueDate, fm.status, vfDate);
    if (!status) continue;
    items.push({
      title: page.title || "Frist",
      dueDate: dueDate.slice(0, 10),
      status,
      caseSlug: typeof fm.case_slug === "string" && fm.case_slug ? fm.case_slug : undefined,
      law: fm.law ? String(fm.law) : undefined,
      vorfristDate: vfDate,
      isNotfrist: fm.is_notfrist === true,
    });
  }

  // Überfällig zuerst, dann nach Datum.
  const rank = { overdue: 0, critical: 1, warning: 2, vorfrist: 3 } as const;
  items.sort((a, b) => rank[a.status] - rank[b.status] || a.dueDate.localeCompare(b.dueDate));
  return { items, permissions: matterPermissionsBySlug(cases) };
}

/** The deadlines one person may be told about (see mayReceiveMatterNotice). */
function itemsFor(
  user: User,
  items: DeadlineItem[],
  permissions: ReadonlyMap<string, MatterPermissions>
): DeadlineItem[] {
  return items.filter((i) => mayReceiveMatterNotice(user, i.caseSlug, permissions));
}

/**
 * The deadlines for a WhatsApp number: a number bound to a person gets that
 * person's view; a number bound only to a role gets deadlines of unrestricted
 * matters. Client/external bindings get nothing.
 */
function itemsForWhatsApp(
  binding: WhatsAppSenderBinding,
  users: User[],
  items: DeadlineItem[],
  permissions: ReadonlyMap<string, MatterPermissions>
): DeadlineItem[] {
  if (binding.userId) {
    const user = users.find((u) => u.id === binding.userId);
    return user ? itemsFor(user, items, permissions) : [];
  }
  return items.filter((i) =>
    mayReceiveMatterNoticeAnonymously(binding.role, i.caseSlug, permissions)
  );
}

function renderDigest(items: DeadlineItem[], appUrl: string): { subject: string; text: string } {
  const overdue = items.filter((i) => i.status === "overdue");
  const critical = items.filter((i) => i.status === "critical");
  const warning = items.filter((i) => i.status === "warning");
  const vorfrist = items.filter((i) => i.status === "vorfrist");

  const parts: string[] = [];
  const section = (label: string, list: DeadlineItem[]) => {
    if (list.length === 0) return;
    parts.push(`${label}:`);
    for (const i of list) {
      const vf = i.vorfristDate ? ` [Vorfrist: ${i.vorfristDate}]` : "";
      parts.push(
        `  • ${i.dueDate} — ${i.title}${i.caseTitle ? ` (Akte: ${i.caseTitle})` : ""}${i.law ? ` [${i.law}]` : ""}${vf}`
      );
    }
    parts.push("");
  };
  section("🔴 ÜBERFÄLLIG", overdue);
  section("🟠 KRITISCH (fällig in ≤ 3 Tagen)", critical);
  section("🟡 Bald fällig (≤ 7 Tage)", warning);
  section("🔵 Vorfrist erreicht", vorfrist);

  parts.push(`Alle Fristen: ${appUrl}/dashboard/deadlines`);
  parts.push("");
  parts.push("Diese Übersicht ersetzt nicht die anwaltliche Fristenkontrolle.");

  const headline = [
    overdue.length ? `${overdue.length} überfällig` : "",
    critical.length ? `${critical.length} kritisch` : "",
    warning.length ? `${warning.length} bald fällig` : "",
    vorfrist.length ? `${vorfrist.length} Vorfrist` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    subject: `⚖️ Fristen-Übersicht: ${headline}`,
    text: parts.join("\n"),
  };
}

const alreadyNotifiedToday = createDailyDedup("subsumio_notify_log");
// Eine überfällige Notfrist eskaliert genau einmal — sie bleibt danach in
// jedem Tages-Digest sichtbar, aber die Alarm-Mail wiederholt sich nicht
// täglich (nicht markiert bei Versandfehler → nächster Lauf versucht erneut).
const notfristEscalatedKey = createKeyedDedup("subsumio_notfrist_escalation_log");

export const GET = createCronHandler(async (_req: NextRequest) => {
  const appUrl = env("NEXT_PUBLIC_APP_URL") || "https://subsum.io";

  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let mailsSent = 0;
  let brainsWithDeadlines = 0;
  let whatsappSent = 0;
  let whatsappBlocked = 0;
  let pipelineSynced = 0;
  let pipelineCreated = 0;
  let notfristEscalated = 0;
  let quietDaysSkipped = 0;
  const errors: string[] = [];
  const warnings: string[] = [];

  const allowedSenders = loadAllowedSenders();
  const whatsappSendersByBrain = new Map<string, WhatsAppSenderBinding[]>();
  for (const sender of allowedSenders) {
    const list = whatsappSendersByBrain.get(sender.brainId) ?? [];
    list.push(sender);
    whatsappSendersByBrain.set(sender.brainId, list);
  }

  for (const [brainId, brainUsers] of recipientsByBrain) {
    brainsChecked++;
    // Active firm staff only — never client accounts or deactivated users.
    const recipients = activeStaffRecipients(brainUsers);

    // A1: Sync pipeline-extracted deadlines into legal_deadline pages
    // so they reach the reminder infrastructure.
    try {
      const syncResult = await syncPipelineDeadlines(brainId);
      pipelineSynced += syncResult.scanned;
      pipelineCreated += syncResult.created;
    } catch (err) {
      // Non-blocking — sync failures must not prevent the digest
      warnings.push(
        `Pipeline deadline sync failed for brain ${brainId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let items: DeadlineItem[];
    let permissions: Map<string, MatterPermissions>;
    try {
      ({ items, permissions } = await collectDeadlines(brainId));
    } catch (err) {
      errors.push(
        `Deadline data unreadable for brain ${brainId}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    if (items.length === 0) continue;
    brainsWithDeadlines++;

    // Kanzlei-Settings früh laden — steuert Ruhetage UND die Eskalation.
    // Bei Lesefehler bewusst fail-open: weiterhin täglich senden statt
    // still zu schweigen (bisheriges Verhalten).
    let kanzlei = null;
    let kanzleiLoaded = false;
    try {
      kanzlei = await loadKanzleiSettingsForBrain(brainId);
      kanzleiLoaded = true;
    } catch (err) {
      warnings.push(
        `Kanzlei settings unreadable for brain ${brainId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Ruhetag (Sa/So/Feiertag im Rechtsraum): der Routine-Digest und der
    // WhatsApp-Digest gehen am nächsten Werktag raus. Nichts geht verloren —
    // überfällige Fristen werden beim nächsten Lauf erneut gefunden. Die
    // Notfrist-Eskalation läuft dagegen IMMER (unten): eine versäumte
    // Notfrist wartet nicht bis Dienstag nach Ostern, und ihre Dedup ist pro
    // Frist, nicht pro Tag.
    const quiet = kanzleiLoaded && isQuietDay(new Date(), kanzlei ?? {});
    if (quiet) quietDaysSkipped++;

    // Der Tages-Digest: einmal pro Brain und Kalendertag, nie an Ruhetagen.
    const digestDue = !quiet && !(await alreadyNotifiedToday(brainId));

    if (digestDue) {
      for (const user of recipients) {
        // Each person gets their own digest with only the matters they may see.
        const own = itemsFor(user, items, permissions);
        if (own.length === 0) continue;
        const { subject, text } = renderDigest(own, appUrl);
        const result = await sendMail({ to: user.email, subject, text });
        if (result.sent) mailsSent++;
        // Not configured is a deployment choice (logged, not sent); a real
        // delivery failure is an error.
        else if (result.error !== "mail_not_configured") {
          errors.push(
            `Digest mail to user ${user.id} failed for brain ${brainId}: ${result.error ?? "unknown"}`
          );
        }
      }
    }

    // Notfrist-Eskalation: eine überfällige Notfrist (unheilbar versäumt)
    // darf nicht im Tages-Digest untergehen — eigene Mail an alle Kanzlei-
    // Mitglieder plus die in den Kanzlei-Einstellungen hinterlegte
    // Eskalationsadresse (z. B. Kanzleiinhaber). Abschaltbar per Setting.
    const overdueNotfristen = items.filter((i) => i.status === "overdue" && i.isNotfrist);
    if (overdueNotfristen.length > 0 && (kanzlei?.deadlineNotfristEscalation ?? true)) {
      try {
        // Nur noch nicht alarmierte Notfristen eskalieren — die Dedup ist
        // pro Frist permanent, nicht pro Tag.
        const fresh: Array<{ item: DeadlineItem; key: string }> = [];
        for (const i of overdueNotfristen) {
          const key = notfristEscalationKey(i);
          if (await notfristEscalatedKey.isNew(brainId, key)) fresh.push({ item: i, key });
        }
        if (fresh.length > 0) {
          const extra = kanzlei?.deadlineEscalationEmail?.trim();
          const escalationText = (list: typeof fresh) =>
            [
              `Folgende Notfristen sind ÜBERFÄLLIG und brauchen sofortige Klärung:`,
              "",
              ...list.map(
                ({ item: i }) =>
                  `  • ${i.dueDate} — ${i.title}${i.caseTitle ? ` (Akte: ${i.caseTitle})` : ""}${i.law ? ` [${i.law}]` : ""}`
              ),
              "",
              `Alle Fristen: ${appUrl}/dashboard/deadlines?status=overdue`,
              "",
              "Eine versäumte Notfrist ist nicht heilbar — bitte sofort prüfen, ob",
              "die Leistung fristwahrend erbracht wurde und die Frist als erledigt",
              "vermerkt ist.",
            ].join("\n");
          // Each staff member only about matters they may see; the firm's
          // configured escalation address (set by an admin) gets all of them.
          const mails = new Map<string, typeof fresh>();
          for (const user of recipients) {
            if (!user.email) continue;
            const own = fresh.filter(({ item }) =>
              mayReceiveMatterNotice(user, item.caseSlug, permissions)
            );
            if (own.length > 0) mails.set(user.email, own);
          }
          if (extra) mails.set(extra, fresh);
          let anySent = false;
          for (const [addr, list] of mails) {
            const result = await sendMail({
              to: addr,
              subject: `🚨 NOTFRIST ÜBERFÄLLIG — ${list.length} Frist(en)`,
              text: escalationText(list),
            });
            if (result.sent) {
              notfristEscalated++;
              anySent = true;
            } else if (result.error !== "mail_not_configured") {
              errors.push(
                `Notfrist escalation mail to ${addr} failed for brain ${brainId}: ${result.error ?? "unknown"}`
              );
            }
          }
          // Erst nach erfolgreichem Versand markieren — ein Totalausfall
          // (mail_not_configured zählt nicht, das ist Deployment-Wahl) darf
          // die Frist nicht als "eskaliert" verbuchen.
          if (anySent) {
            for (const { key } of fresh) await notfristEscalatedKey.mark(brainId, key);
          }
        }
      } catch (err) {
        errors.push(
          `Notfrist escalation failed for brain ${brainId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // WhatsApp Fristen-Reminder an aktive WhatsApp-Anwälte — gehört zum
    // Tages-Digest, also ebenfalls nicht an Ruhetagen und nur einmal am Tag.
    const waBindings = whatsappSendersByBrain.get(brainId);
    if (digestDue && waBindings && waBindings.length > 0) {
      const templateName = env("WHATSAPP_DEADLINE_TEMPLATE");
      for (const binding of waBindings) {
        const own = itemsForWhatsApp(binding, brainUsers, items, permissions);
        if (own.length === 0) continue;
        const phone = binding.phone;
        const { text } = renderDigest(own, appUrl);
        const waText = `⚖️ Fristen-Übersicht:\n\n${text}`;
        const template: WhatsAppTemplateMessage | undefined = templateName
          ? {
              name: templateName,
              language: { code: "de" },
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: text.slice(0, 900) }],
                },
              ],
            }
          : undefined;
        try {
          const result = await sendProactiveMessage({
            to: phone,
            brainId,
            scope: "deadline_alert",
            freeform: waText,
            template,
            urgent: true,
          });
          if (result.sent) whatsappSent++;
          else whatsappBlocked++;
        } catch (err) {
          log.error(
            `[cron/deadlines] WhatsApp send to ${phone.slice(-4)} failed:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    }
  }

  // A run with errors answers 500 so the cron log shows the failure; the
  // body keeps the full report.
  const ok = errors.length === 0;
  return Response.json(
    {
      ok,
      brains_checked: brainsChecked,
      brains_with_deadlines: brainsWithDeadlines,
      mails_sent: mailsSent,
      whatsapp_sent: whatsappSent,
      whatsapp_blocked: whatsappBlocked,
      pipeline_synced: pipelineSynced,
      pipeline_created: pipelineCreated,
      notfrist_escalated: notfristEscalated,
      quiet_days_skipped: quietDaysSkipped,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    { status: ok ? 200 : 500 }
  );
});
