import type { AbsenceRecord } from "@/lib/absence";
import { publicHolidays, type Bundesland } from "@/lib/legal-deadlines";
import { zonedDateString } from "@/lib/datetime";

/**
 * Personalstamm (WP-8.53): Mitarbeiterakte mit Urlaubskonto.
 * Ergänzt das bestehende Absence-Modul (Urlaubsvertretung) um
 * Stammdaten + Resturlaubsberechnung.
 */

export type StaffRole = "partner" | "anwalt" | "assistenz" | "rechtsfachwirt" | "sonstige";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  /** ISO-Datum des Eintritts. */
  hired_at?: string;
  /** Vertragsende (befristete Verträge). */
  contract_until?: string;
  /** Jahresurlaubsanspruch in Arbeitstagen (AT: gesetzlich 25 bei 5-Tage-Woche). */
  vacation_days_per_year: number;
  /** Verbrauchte Resturlaubs-Tage aus Vorjahren (Altdaten-Übertrag). */
  vacation_carryover_days: number;
  phone?: string;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffCreateInput {
  name: string;
  email: string;
  role?: StaffRole;
  hired_at?: string;
  contract_until?: string;
  vacation_days_per_year?: number;
  vacation_carryover_days?: number;
  phone?: string;
  notes?: string;
}

export class StaffInputError extends Error {}

export function createStaffMember(input: StaffCreateInput): StaffMember {
  if (!input.name.trim()) throw new StaffInputError("Name erforderlich.");
  if (!input.email.includes("@")) throw new StaffInputError("Gültige E-Mail erforderlich.");
  const now = new Date().toISOString();
  return {
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role ?? "sonstige",
    hired_at: input.hired_at,
    contract_until: input.contract_until,
    vacation_days_per_year: input.vacation_days_per_year ?? 25,
    vacation_carryover_days: input.vacation_carryover_days ?? 0,
    phone: input.phone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    active: true,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Gesetzliche Feiertage in Österreich, an denen kein Urlaubstag verbraucht
 * wird (§ 7 ARG). Quelle ist dieselbe Feiertagsliste wie für die Fristen —
 * ohne den Karfreitag: der steht dort, weil § 126 Abs 2 ZPO ihn für das
 * Fristende ausnimmt, ist aber seit 2019 kein allgemeiner Feiertag mehr.
 */
function vacationHolidays(year: number): Set<string> {
  const out = new Set<string>();
  for (const [date, name] of publicHolidays(year, "AT" as Bundesland, "AT")) {
    if (name !== "Karfreitag") out.add(date);
  }
  return out;
}

/**
 * Arbeitstage (Mo–Fr ohne österreichische Feiertage) zwischen zwei
 * ISO-Daten, inklusive beider Enden.
 */
export function workdaysBetween(startIso: string, endIso: string): number {
  return workdayDates(startIso, endIso).length;
}

/** Die einzelnen Arbeitstage (ISO) zwischen zwei ISO-Daten, inklusive. */
function workdayDates(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${endIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const holidays = new Map<number, Set<string>>();
  const out: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const year = d.getUTCFullYear();
    let set = holidays.get(year);
    if (!set) {
      set = vacationHolidays(year);
      holidays.set(year, set);
    }
    const iso = d.toISOString().slice(0, 10); // utc-date-ok: d walks calendar days at UTC midnight
    if (!set.has(iso)) out.push(iso);
  }
  return out;
}

/**
 * Urlaub ist, was als Art „urlaub“ erfasst ist. Ältere Einträge ohne Art
 * werden am Freitext-Grund erkannt.
 */
export function isVacationAbsence(a: AbsenceRecord): boolean {
  if (a.kind) return a.kind === "urlaub";
  return /urlaub|vacation|ferien|erholung/i.test(a.reason ?? "");
}

export interface VacationAccount {
  /** Anspruch im laufenden Kalenderjahr inkl. Übertrag. */
  entitled: number;
  /** Verbrauchte Arbeitstage im Jahr (Urlaubstage vor heute). */
  used: number;
  /** Geplante Arbeitstage im Jahr (ab heute). */
  planned: number;
  /** Verbleibend = entitled − used − planned. */
  remaining: number;
  year: number;
}

/**
 * Urlaubskonto eines Kalenderjahres. Jeder Urlaubstag zählt in dem Jahr, in
 * dem er liegt (ein Urlaub über den Jahreswechsel wird aufgeteilt).
 * „Verbraucht“ richtet sich nach dem Datum, nicht nach dem gespeicherten
 * Status (der wird nicht automatisch fortgeschrieben); ein vorzeitig
 * abgeschlossener Urlaub endet mit dem Tag des Abschlusses. Kalendertage
 * nach Europe/Vienna.
 */
export function vacationAccount(
  member: StaffMember,
  absences: AbsenceRecord[],
  year = Number(zonedDateString(new Date()).slice(0, 4)),
  now: Date = new Date()
): VacationAccount {
  const entitled = member.vacation_days_per_year + member.vacation_carryover_days;
  const today = zonedDateString(now);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  let used = 0;
  let planned = 0;
  for (const a of absences) {
    if (a.status === "cancelled" || !isVacationAbsence(a)) continue;
    if (a.user_email.toLowerCase() !== member.email.toLowerCase()) continue;
    let end = a.end_date.slice(0, 10);
    if (a.status === "completed" && a.updated_at) {
      const closedOn = zonedDateString(new Date(a.updated_at));
      if (closedOn < end) end = closedOn;
    }
    const start = a.start_date.slice(0, 10);
    const from = start > yearStart ? start : yearStart;
    const to = end < yearEnd ? end : yearEnd;
    for (const day of workdayDates(from, to)) {
      if (day < today) used++;
      else planned++;
    }
  }
  return { entitled, used, planned, remaining: entitled - used - planned, year };
}
