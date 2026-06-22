import { NextRequest } from "next/server";
import { sendMail } from "@/lib/mail";
import { computeDeadlineStatus } from "@/lib/legal-deadlines";
import { createCronHandler } from "@/lib/api-handler";
import { fetchPages, getRecipientsByBrain, createDailyDedup } from "@/lib/cron-utils";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { loadAllowedSenders } from "@/lib/whatsapp/verify";
import type { WhatsAppTemplateMessage } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/deadlines — täglicher Fristen-Digest per E-Mail.
 *
 * Läuft als Vercel Cron (vercel.json) oder manuell:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/deadlines
 *
 * Pro Brain (Kanzlei): sammelt Fristen aus legal_case-Frontmattern und
 * legal_deadline-Seiten, filtert auf überfällig / kritisch (≤3 Tage) /
 * bald fällig (≤7 Tage) und schickt JEDEM Nutzer des Brains einen Digest.
 * Dedupe: maximal eine Mail pro Brain pro Kalendertag (Postgres-Log;
 * ohne DB — Dev-Modus — wird ohne Dedupe gesendet).
 */

interface DeadlineItem {
  title: string;
  dueDate: string;
  status: "overdue" | "critical" | "warning";
  caseTitle?: string;
  law?: string;
}

function classify(dueDate: string, doneFlag: unknown): DeadlineItem["status"] | null {
  if (doneFlag === "done") return null;
  const status = computeDeadlineStatus(
    dueDate,
    typeof doneFlag === "string" ? doneFlag : undefined
  );
  if (status === "overdue" || status === "critical" || status === "warning") return status;
  return null;
}

async function collectDeadlines(brainId: string): Promise<DeadlineItem[]> {
  const items: DeadlineItem[] = [];

  // 1. Fristen aus Akten-Frontmattern (legal_case → frontmatter.deadlines[])
  const cases = await fetchPages(brainId, "legal_case", 200);
  for (const page of cases) {
    const fm = page.frontmatter ?? {};
    const deadlines = Array.isArray(fm.deadlines) ? fm.deadlines : [];
    for (const raw of deadlines) {
      if (!raw || typeof raw !== "object") continue;
      const d = raw as Record<string, unknown>;
      const dueDate = String(d.due_date ?? d.date ?? "");
      if (!dueDate) continue;
      const status = classify(dueDate, d.status);
      if (!status) continue;
      items.push({
        title: String(d.title ?? "Frist"),
        dueDate: dueDate.slice(0, 10),
        status,
        caseTitle: page.title,
        law: d.law ? String(d.law) : undefined,
      });
    }
  }

  // 2. Eigenständige legal_deadline-Seiten
  const deadlinePages = await fetchPages(brainId, "legal_deadline", 100);
  for (const page of deadlinePages) {
    const fm = page.frontmatter ?? {};
    const dueDate = String(fm.due_date ?? fm.date ?? fm.deadline_date ?? "");
    if (!dueDate) continue;
    const status = classify(dueDate, fm.status);
    if (!status) continue;
    items.push({
      title: page.title || "Frist",
      dueDate: dueDate.slice(0, 10),
      status,
      law: fm.law ? String(fm.law) : undefined,
    });
  }

  // Überfällig zuerst, dann nach Datum.
  const rank = { overdue: 0, critical: 1, warning: 2 } as const;
  items.sort((a, b) => rank[a.status] - rank[b.status] || a.dueDate.localeCompare(b.dueDate));
  return items;
}

function renderDigest(items: DeadlineItem[], appUrl: string): { subject: string; text: string } {
  const overdue = items.filter((i) => i.status === "overdue");
  const critical = items.filter((i) => i.status === "critical");
  const warning = items.filter((i) => i.status === "warning");

  const parts: string[] = [];
  const section = (label: string, list: DeadlineItem[]) => {
    if (list.length === 0) return;
    parts.push(`${label}:`);
    for (const i of list) {
      parts.push(
        `  • ${i.dueDate} — ${i.title}${i.caseTitle ? ` (Akte: ${i.caseTitle})` : ""}${i.law ? ` [${i.law}]` : ""}`
      );
    }
    parts.push("");
  };
  section("🔴 ÜBERFÄLLIG", overdue);
  section("🟠 KRITISCH (fällig in ≤ 3 Tagen)", critical);
  section("🟡 Bald fällig (≤ 7 Tage)", warning);

  parts.push(`Alle Fristen: ${appUrl}/dashboard/deadlines`);
  parts.push("");
  parts.push("Diese Übersicht ersetzt nicht die anwaltliche Fristenkontrolle.");

  const headline = [
    overdue.length ? `${overdue.length} überfällig` : "",
    critical.length ? `${critical.length} kritisch` : "",
    warning.length ? `${warning.length} bald fällig` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    subject: `⚖️ Fristen-Übersicht: ${headline}`,
    text: parts.join("\n"),
  };
}

const alreadyNotifiedToday = createDailyDedup("subsumio_notify_log");

export const GET = createCronHandler(async (_req: NextRequest) => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu";

  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let mailsSent = 0;
  let brainsWithDeadlines = 0;
  let whatsappSent = 0;
  let whatsappBlocked = 0;

  const allowedSenders = loadAllowedSenders();
  const whatsappSendersByBrain = new Map<string, string[]>();
  for (const sender of allowedSenders) {
    const list = whatsappSendersByBrain.get(sender.brainId) ?? [];
    list.push(sender.phone);
    whatsappSendersByBrain.set(sender.brainId, list);
  }

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    const items = await collectDeadlines(brainId);
    if (items.length === 0) continue;
    brainsWithDeadlines++;

    if (await alreadyNotifiedToday(brainId)) continue;

    const { subject, text } = renderDigest(items, appUrl);
    for (const user of recipients) {
      const result = await sendMail({ to: user.email, subject, text });
      if (result.sent) mailsSent++;
    }

    // WhatsApp Fristen-Reminder an aktive WhatsApp-Anwälte
    const waPhones = whatsappSendersByBrain.get(brainId);
    if (waPhones && waPhones.length > 0) {
      const waText = `⚖️ Fristen-Übersicht:\n\n${text}`;
      const templateName = process.env.WHATSAPP_DEADLINE_TEMPLATE;
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
      for (const phone of waPhones) {
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
          console.error(
            `[cron/deadlines] WhatsApp send to ${phone.slice(-4)} failed:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    }
  }

  return Response.json({
    ok: true,
    brains_checked: brainsChecked,
    brains_with_deadlines: brainsWithDeadlines,
    mails_sent: mailsSent,
    whatsapp_sent: whatsappSent,
    whatsapp_blocked: whatsappBlocked,
  });
});
