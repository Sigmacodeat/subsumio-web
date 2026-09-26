/**
 * Aufbewahrungsfristen geschlossener Akten — die Einstufung, mit der der
 * tägliche Cron (src/app/api/cron/retention/route.ts) benachrichtigt:
 *   - ≥ 7 Jahre seit Abschluss: "Prüfung empfohlen" (§§ 131, 132 BAO)
 *   - ≥ 10 Jahre: "Löschfällig" (3 Jahre Karenz nach Fristablauf)
 * Akten unter Legal Hold sind ausgenommen.
 */

export const RETENTION_REVIEW_YEARS = 7; // § 132 BAO
export const RETENTION_DELETE_YEARS = 10;

const YEAR_MS = 1000 * 60 * 60 * 24 * 365;

export type RetentionAction = "review" | "delete";

/** Years since `closedAt` (365-day years), NaN for an unreadable date. */
export function yearsSinceClosure(closedAt: string, now: number = Date.now()): number {
  return (now - new Date(closedAt).getTime()) / YEAR_MS;
}

export function classifyRetention(
  closedAt: string,
  now: number = Date.now()
): RetentionAction | null {
  const years = yearsSinceClosure(closedAt, now);
  if (!Number.isFinite(years)) return null;
  if (years >= RETENTION_DELETE_YEARS) return "delete";
  if (years >= RETENTION_REVIEW_YEARS) return "review";
  return null;
}

/** A matter the retention check looks at: closed, and not under legal hold. */
export function isRetentionCandidate(fm: Record<string, unknown> | undefined | null): boolean {
  if (!fm || fm.legal_hold === true) return false;
  return Boolean(fm.closed_at) || fm.status === "closed" || Boolean(fm.archived_at);
}
