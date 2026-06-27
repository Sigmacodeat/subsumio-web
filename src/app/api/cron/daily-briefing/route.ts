import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { batchFetchPages, createDailyDedup } from "@/lib/cron-utils";
import { loadAllowedSenders, phoneHash } from "@/lib/whatsapp/verify";
import {
  buildDailyBriefing,
  BRIEFING_DEDUP_TABLE,
  type BriefingCase,
} from "@/lib/whatsapp/daily-briefing";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import type { QuietHours } from "@/lib/whatsapp/outbound-gate";

export const dynamic = "force-dynamic";

/**
 * Proactive daily briefing (Paket 33, P1-SECR-004).
 *
 * For each configured WhatsApp sender (a lawyer, with their E.164 number), build a
 * "Guten Morgen" digest of upcoming deadlines from their brain's case pages and
 * push it through the gated outbound path. The gate enforces consent + the 24h
 * window / template rule, so this cron can never bypass compliance.
 *
 * Delivery requires the recipient to hold an active `daily_briefing` consent; the
 * E.164 number comes from the configured sender list. When the 24h window is
 * closed, an approved template (env `WHATSAPP_BRIEFING_TEMPLATE`) is required —
 * otherwise the send is gated and audited as `outbound_blocked` (honest no-op).
 */

const dedupBriefing = createDailyDedup(BRIEFING_DEDUP_TABLE);

function quietHoursFromEnv(now: Date): QuietHours | undefined {
  const raw = process.env.WHATSAPP_BRIEFING_QUIET_HOURS; // e.g. "21-7"
  if (!raw) return undefined;
  const m = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return undefined;
  return {
    startHour: parseInt(m[1], 10),
    endHour: parseInt(m[2], 10),
    localHour: now.getHours(),
  };
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const now = new Date();
  const senders = loadAllowedSenders().filter((s) => s.role !== "assistant");
  const briefingTemplate = process.env.WHATSAPP_BRIEFING_TEMPLATE;
  const quietHours = quietHoursFromEnv(now);

  let sent = 0;
  let blocked = 0;
  let empty = 0;
  const errors: string[] = [];

  for (const sender of senders) {
    try {
      // Dedup per recipient per day so a re-run can't double-brief.
      const key = `${sender.brainId}:${phoneHash(sender.phone)}`;
      if (await dedupBriefing(key)) continue;

      // Subsumio: was "case" — a page type nothing in this codebase writes
      // (legal cases are typed "legal_case" everywhere else, e.g. cron/
      // deadlines.ts, matter-context.ts), so the briefing was silently
      // grounded on an empty/wrong page set. Also folds in standalone
      // legal_deadline pages, the same second source cron/deadlines.ts
      // reads — a deadline tracked as its own page (not embedded in a
      // case's frontmatter.deadlines[]) was invisible to the briefing.
      const batch = await batchFetchPages(sender.brainId, ["legal_case", "legal_deadline"], 1000);
      const pages = batch["legal_case"] ?? [];
      const standaloneDeadlinePages = batch["legal_deadline"] ?? [];
      const cases: BriefingCase[] = pages.map((p) => {
        const fm = p.frontmatter ?? {};
        return {
          caseNumber: String(fm.case_number ?? p.slug),
          title: String(fm.title ?? p.title ?? ""),
          deadlines: Array.isArray(fm.deadlines) ? (fm.deadlines as BriefingCase["deadlines"]) : [],
        };
      });

      if (standaloneDeadlinePages.length > 0) {
        cases.push({
          caseNumber: "—",
          title: "Eigenständige Fristen",
          deadlines: standaloneDeadlinePages.map((p) => {
            const fm = p.frontmatter ?? {};
            return {
              title: p.title || "Frist",
              due_date: String(fm.due_date ?? fm.date ?? fm.deadline_date ?? ""),
              done: fm.status === "done",
            };
          }),
        });
      }

      const text = buildDailyBriefing({ anwaltName: sender.name, cases, now });
      if (!text) {
        empty++;
        continue;
      }

      const result = await sendProactiveMessage({
        to: sender.phone,
        brainId: sender.brainId,
        scope: "daily_briefing",
        freeform: text,
        template: briefingTemplate
          ? { name: briefingTemplate, language: { code: "de" } }
          : undefined,
        quietHours,
        now,
      });

      if (result.sent) sent++;
      else blocked++;
    } catch (err) {
      errors.push(String(err instanceof Error ? err.message : err));
    }
  }

  return NextResponse.json({
    ok: true,
    recipients: senders.length,
    sent,
    blocked,
    empty,
    errors: errors.length > 0 ? errors : undefined,
  });
});
