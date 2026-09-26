/**
 * Controlling — Anwaltskennzahlen aus der Zeiterfassung.
 *
 * Zeit liegt an zwei Stellen: in der `time_entries`-Liste jeder Akte und als
 * eigene `time_entry`-Seiten (Timer, Importe). Beide zählen. Jede Stunde
 * gehört dem, der sie geleistet hat (`entry.lawyer`); nur ohne Angabe fällt
 * sie dem zuständigen Anwalt der Akte zu. Zeiträume nach dem Kalender der
 * Kanzlei (Europe/Vienna).
 */

import { zonedDateString } from "@/lib/datetime";

export type ControllingPeriod = "month" | "quarter" | "year";

/** Soll-Stunden je Anwalt: 150 h pro Monat, hochgerechnet auf den Zeitraum. */
export const TARGET_HOURS: Record<ControllingPeriod, number> = {
  month: 150,
  quarter: 450,
  year: 1800,
};

export const NO_LAWYER = "Ohne zuständigen Anwalt";

export interface ControllingEntry {
  id?: string;
  date?: string;
  minutes?: number;
  rate?: number;
  billable?: boolean;
  billed?: boolean;
  lawyer?: string;
  case_slug?: string;
  status?: string;
}

export interface ControllingCase {
  slug: string;
  frontmatter?: Record<string, unknown>;
}

export interface LawyerStats {
  name: string;
  totalHours: number;
  totalRevenue: number;
  /** Akten, für die der Anwalt zuständig ist oder in denen er im Zeitraum Zeit erfasst hat. */
  caseCount: number;
  /** Abrechenbare Stunden (entry.billable !== false) — nicht „bereits abgerechnet“. */
  billableHours: number;
  /** Davon bereits abgerechnet (entry.billed). */
  billedHours: number;
  /** Stunden mit hinterlegtem Stundensatz — Basis für den Ø-Satz. */
  ratedHours: number;
  targetHours: number;
}

function inPeriod(date: string, period: ControllingPeriod, today: string): boolean {
  const d = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (d.slice(0, 4) !== today.slice(0, 4)) return false;
  if (period === "year") return true;
  const month = Number(d.slice(5, 7));
  const nowMonth = Number(today.slice(5, 7));
  if (period === "month") return month === nowMonth;
  return Math.floor((month - 1) / 3) === Math.floor((nowMonth - 1) / 3);
}

export function aggregateLawyerStats(
  cases: ControllingCase[],
  standaloneEntries: ControllingEntry[],
  period: ControllingPeriod,
  now: Date = new Date()
): LawyerStats[] {
  const today = zonedDateString(now);
  const stats = new Map<string, LawyerStats>();
  const caseSets = new Map<string, Set<string>>();
  const get = (name: string): LawyerStats => {
    let s = stats.get(name);
    if (!s) {
      s = {
        name,
        totalHours: 0,
        totalRevenue: 0,
        caseCount: 0,
        billableHours: 0,
        billedHours: 0,
        ratedHours: 0,
        targetHours: TARGET_HOURS[period],
      };
      stats.set(name, s);
      caseSets.set(name, new Set());
    }
    return s;
  };

  const ownerOf = new Map<string, string>();
  const entries: ControllingEntry[] = [];
  const seen = new Set<string>();
  for (const c of cases) {
    const fm = c.frontmatter ?? {};
    if (String(fm.status ?? "") === "tombstoned") continue;
    const owner = String(fm.own_lawyer_name ?? "").trim() || NO_LAWYER;
    ownerOf.set(c.slug, owner);
    get(owner);
    caseSets.get(owner)!.add(c.slug);
    const list = Array.isArray(fm.time_entries) ? (fm.time_entries as ControllingEntry[]) : [];
    for (const e of list) {
      const key = `${c.slug}#${e.id ?? ""}`;
      if (e.id && seen.has(key)) continue;
      if (e.id) seen.add(key);
      entries.push({ ...e, case_slug: c.slug });
    }
  }
  for (const e of standaloneEntries) {
    if (String(e.status ?? "") === "tombstoned") continue;
    const key = `${e.case_slug ?? ""}#${e.id ?? ""}`;
    if (e.id && seen.has(key)) continue;
    if (e.id) seen.add(key);
    entries.push(e);
  }

  for (const e of entries) {
    if (!e.date || !inPeriod(String(e.date), period, today)) continue;
    const lawyer =
      String(e.lawyer ?? "").trim() ||
      (e.case_slug ? ownerOf.get(e.case_slug) : undefined) ||
      NO_LAWYER;
    const s = get(lawyer);
    if (e.case_slug) caseSets.get(lawyer)!.add(e.case_slug);
    const hours = (Number(e.minutes) || 0) / 60;
    s.totalHours += hours;
    if (e.billable !== false) s.billableHours += hours;
    if (e.billed === true) s.billedHours += hours;
    // Leistungswert nur aus hinterlegten Stundensätzen — kein erfundener Standardsatz.
    if (e.rate) {
      s.totalRevenue += hours * Number(e.rate);
      s.ratedHours += hours;
    }
  }

  for (const [name, s] of stats) s.caseCount = caseSets.get(name)?.size ?? 0;
  return [...stats.values()];
}

/** A standalone `time_entry` page as a controlling entry (id = page slug). */
export function entryFromTimeEntryPage(
  slug: string,
  fm: Record<string, unknown>
): ControllingEntry {
  return {
    id: slug,
    date: String(fm.date ?? ""),
    minutes: Number(fm.minutes ?? 0),
    rate: fm.rate != null ? Number(fm.rate) : undefined,
    billable: fm.billable === undefined ? undefined : Boolean(fm.billable),
    billed: Boolean(fm.billed),
    lawyer: fm.lawyer ? String(fm.lawyer) : undefined,
    case_slug: fm.case_slug ? String(fm.case_slug) : undefined,
    status: fm.status ? String(fm.status) : undefined,
  };
}
