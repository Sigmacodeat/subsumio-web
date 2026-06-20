/**
 * Daily briefing composer (Paket 33, P1-SECR-004).
 *
 * Pure, deterministic builder for the proactive "Guten Morgen" digest the AI
 * secretary pushes over WhatsApp. Takes the lawyer's cases + a clock, returns the
 * briefing text — or `null` when there is nothing worth a push (no spam on empty
 * days). Kept I/O-free so it is fully unit-testable; the cron does the fetching
 * and the gated send.
 *
 * Full Superbrain grounding (facts, gaps, freshness per Paket 31) layers on later;
 * this first version surfaces upcoming deadlines from the existing case pages.
 */

export interface BriefingDeadline {
  title?: string;
  due_date?: string;
  date?: string;
  reminder_sent_at?: string;
  done?: boolean;
}

export interface BriefingCase {
  caseNumber: string;
  title?: string;
  deadlines: BriefingDeadline[];
}

export interface BuildBriefingInput {
  anwaltName?: string;
  cases: BriefingCase[];
  now: Date;
  /** How many days ahead to include. Default 3. */
  horizonDays?: number;
}

interface CollectedDeadline {
  dueDate: string;
  title: string;
  caseNumber: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Collect not-yet-done deadlines due within [today, today+horizon], sorted by date.
 * Exported for testing the selection logic independently of the rendered text.
 */
export function collectUpcomingDeadlines(input: BuildBriefingInput): CollectedDeadline[] {
  const horizon = input.horizonDays ?? 3;
  const today = ymd(input.now);
  const limit = ymd(new Date(input.now.getTime() + horizon * 24 * 60 * 60 * 1000));

  const out: CollectedDeadline[] = [];
  for (const c of input.cases) {
    for (const d of c.deadlines) {
      if (d.done) continue;
      const due = String(d.due_date ?? d.date ?? "");
      if (!due || due < today || due > limit) continue;
      out.push({ dueDate: due, title: String(d.title ?? "Frist"), caseNumber: c.caseNumber });
    }
  }
  out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  return out;
}

/**
 * Render the briefing text, or `null` if there is nothing to report.
 */
export function buildDailyBriefing(input: BuildBriefingInput): string | null {
  const deadlines = collectUpcomingDeadlines(input);
  if (deadlines.length === 0) return null;

  const today = ymd(input.now);
  const greeting = `Guten Morgen${input.anwaltName ? `, ${input.anwaltName}` : ""}! ☀️`;
  const dueToday = deadlines.filter((d) => d.dueDate === today);
  const lines: string[] = [
    greeting,
    "",
    `📋 ${deadlines.length} Frist${deadlines.length === 1 ? "" : "en"} in den nächsten Tagen${
      dueToday.length > 0 ? ` (${dueToday.length} heute fällig)` : ""
    }:`,
  ];

  for (const d of deadlines) {
    const flag = d.dueDate === today ? "🔴" : "•";
    lines.push(`${flag} ${d.dueDate} — ${d.title} (Akte ${d.caseNumber})`);
  }

  lines.push("");
  lines.push('Antworten Sie mit "heute" für die volle Tagesübersicht.');
  return lines.join("\n");
}
