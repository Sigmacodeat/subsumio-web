import type { AbsenceRecord } from "@/lib/absence";

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

/** Werktage (Mo–Fr) zwischen zwei ISO-Daten, inklusive beider Enden. */
export function workdaysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

/** Urlaubs-Absences gelten als solche, wenn der Grund „urlaub"/„vacation" enthält. */
export function isVacationAbsence(a: AbsenceRecord): boolean {
  return /urlaub|vacation|ferien/i.test(a.reason ?? "");
}

export interface VacationAccount {
  /** Anspruch im laufenden Kalenderjahr inkl. Übertrag. */
  entitled: number;
  /** Verbrauchte Werktage (aktive + abgeschlossene Urlaubs-Absences im Jahr). */
  used: number;
  /** Bereits geplante Werktage (status „planned"). */
  planned: number;
  /** Verbleibend = entitled − used − planned. */
  remaining: number;
  year: number;
}

export function vacationAccount(
  member: StaffMember,
  absences: AbsenceRecord[],
  year = new Date().getUTCFullYear()
): VacationAccount {
  const entitled = member.vacation_days_per_year + member.vacation_carryover_days;
  let used = 0;
  let planned = 0;
  for (const a of absences) {
    if (a.status === "cancelled" || !isVacationAbsence(a)) continue;
    if (a.user_email.toLowerCase() !== member.email.toLowerCase()) continue;
    if (!a.start_date.startsWith(String(year))) continue;
    const days = workdaysBetween(a.start_date, a.end_date);
    if (a.status === "planned") planned += days;
    else used += days;
  }
  return { entitled, used, planned, remaining: entitled - used - planned, year };
}
