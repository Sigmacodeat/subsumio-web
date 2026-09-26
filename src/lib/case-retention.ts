/**
 * Aufbewahrungsfrist einer Akte (Handakte, § 12 RAO: mind. 5 Jahre; § 132
 * BAO: 7 Jahre für steuerlich relevante Unterlagen). Konservativ gilt für jede
 * abgeschlossene Akte die längere Frist: 7 Jahre ab dem Ende des
 * Kalenderjahres des Abschlusses (Zählweise § 132 Abs 1 BAO). Eine am
 * 5. März 2026 abgeschlossene Akte wird bis 31. Dezember 2033 aufbewahrt —
 * immer mindestens Abschlussdatum + 7 Jahre.
 *
 * Archivieren (= Aktenabschluss) ist kein Löschen: eine Akte, deren Frist
 * läuft, darf weder in den Papierkorb noch endgültig gelöscht werden. Diese
 * Datei ist die eine Quelle für diese Entscheidung — die Löschroute, der
 * Papierkorb und der Purge-Cron fragen alle hier.
 */

import { zonedDateString } from "@/lib/datetime";

export const CASE_RETENTION_YEARS = 7;

/** Status, mit denen das Mandat beendet ist — ab dann läuft die Frist. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set([
  "archived",
  "closed",
  "settled",
  "won",
  "lost",
]);

function present(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/** Kalenderjahr (Europe/Vienna) eines Zeitpunkts; reines "YYYY-MM-DD" ohne UTC-Verschiebung. */
function viennaYear(value: unknown): number | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", year: "numeric" }).format(value)
    );
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const dateOnly = /^(\d{4})-\d{2}-\d{2}$/.exec(raw);
  if (dateOnly) return Number(dateOnly[1]);
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", year: "numeric" }).format(d)
  );
}

/** Aufbewahrungsende ("YYYY-12-31") für ein Abschlussdatum; null bei unlesbarem Datum. */
export function caseRetentionUntil(closedAt: unknown): string | null {
  const year = viennaYear(closedAt);
  return year === null ? null : `${year + CASE_RETENTION_YEARS}-12-31`;
}

/** Ende des Tags eines "YYYY-MM-DD"-Datums (bzw. der Zeitpunkt selbst) in ms; null bei unlesbar. */
function untilMs(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? t + 86_400_000 - 1 : t;
}

function asDateString(value: unknown): string {
  if (value instanceof Date) return zonedDateString(value);
  return String(value).trim().slice(0, 10);
}

export interface CaseRetentionState {
  /** Die Akte ist abgeschlossen/archiviert — eine Aufbewahrungsfrist gilt. */
  applies: boolean;
  /** Aufbewahrungsende ("YYYY-MM-DD"); null = nicht bestimmbar. */
  until: string | null;
  /** Frist läuft noch (oder ist nicht bestimmbar → fail-closed: läuft). */
  running: boolean;
}

/**
 * Stand der Aufbewahrungsfrist einer Akte. Das gespeicherte `retention_until`
 * kann die Frist nur verlängern, nie unter die aus `closed_at`/`archived_at`
 * berechnete gesetzliche Untergrenze drücken. Unlesbare Angaben → Frist läuft.
 */
export function caseRetentionState(
  fm: Record<string, unknown> | null | undefined,
  now: Date = new Date()
): CaseRetentionState {
  const f = fm ?? {};
  const status = typeof f.status === "string" ? f.status : "";
  const applies =
    CLOSED_STATUSES.has(status) ||
    present(f.closed_at) ||
    present(f.archived_at) ||
    present(f.retention_until);
  if (!applies) return { applies: false, until: null, running: false };

  const candidates: Array<{ label: string; ms: number }> = [];
  let unreadable = false;
  if (present(f.retention_until)) {
    const ms = untilMs(f.retention_until);
    if (ms === null) unreadable = true;
    else candidates.push({ label: asDateString(f.retention_until), ms });
  }
  for (const basis of [f.closed_at, f.archived_at]) {
    if (!present(basis)) continue;
    const until = caseRetentionUntil(basis);
    if (until === null) {
      unreadable = true;
      continue;
    }
    candidates.push({ label: until, ms: untilMs(until)! });
  }
  if (candidates.length === 0) return { applies: true, until: null, running: true };
  const latest = candidates.reduce((a, b) => (b.ms > a.ms ? b : a));
  return {
    applies: true,
    until: latest.label,
    running: unreadable || now.getTime() <= latest.ms,
  };
}

/** Deutsche Meldung für eine verweigerte Löschung während der Frist. */
export function retentionRunningMessage(until: string | null): string {
  const bis = until ? ` bis ${until.split("-").reverse().join(".")}` : "";
  return `Die Akte ist abgeschlossen und unterliegt der gesetzlichen Aufbewahrungspflicht (§ 12 RAO, § 132 BAO)${bis}. Sie kann vor Fristende nicht gelöscht werden.`;
}
