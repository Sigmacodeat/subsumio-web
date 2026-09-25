/**
 * Retention of closed matters (§ 132 Abs 1 BAO): the period runs from the END
 * of the calendar year in which the matter was closed — not from the closing
 * date itself. A matter closed on 5 March 2019 is kept until 31 Dec 2026.
 */

export type RetentionAction = "keep" | "review" | "delete";

/** Year of a date string; pure "YYYY-MM-DD" is read from its parts (no UTC shift). */
function yearOf(closedAt: string): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(closedAt.trim());
  if (m) return Number(m[1]);
  const d = new Date(closedAt);
  if (!Number.isFinite(d.getTime())) return null;
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", year: "numeric" }).format(d)
  );
}

/**
 * Full years elapsed since the start of the period (1 Jan after closing) and
 * the resulting action: review once the retention period has run, delete
 * after the additional grace years.
 */
export function retentionStatus(
  closedAt: string,
  now: Date,
  retentionYears: number,
  graceYears: number
): { action: RetentionAction; yearsSinceStart: number } | null {
  const year = yearOf(closedAt);
  if (year === null) return null;
  const startMs = Date.UTC(year + 1, 0, 1);
  const yearsSinceStart = Math.max(0, (now.getTime() - startMs) / (365.25 * 24 * 3600 * 1000));
  const reviewAt = Date.UTC(year + 1 + retentionYears, 0, 1);
  const deleteAt = Date.UTC(year + 1 + retentionYears + graceYears, 0, 1);
  const t = now.getTime();
  const action: RetentionAction = t >= deleteAt ? "delete" : t >= reviewAt ? "review" : "keep";
  return { action, yearsSinceStart };
}
