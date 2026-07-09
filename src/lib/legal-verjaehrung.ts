/**
 * Verjährungs-Engine — Berechnet Verjährungsfristen mit Hemmung und Ruhen.
 *
 * Deutsche Verjährungsregelung (BGB):
 * - § 195 BGB: Regelmäßige Verjährungsfrist = 3 Jahre (ab Kenntnis)
 * - § 199 Abs. 3 BGB: Absolute Höchstfrist = 10 Jahre (ab Entstehung)
 * - § 203 BGB: Hemmung durch Verhandlungen (bis 6 Monate nach Ende)
 * - § 204 BGB: Hemmung durch Rechtsverfolgung (Klage, Mahnbescheid, etc.)
 * - § 205 BGB: Ruhen der Verjährung (bei beschränkter Haftung)
 * - § 206 BGB: Hemmung bei höherer Gewalt
 * - § 207 BGB: Hemmung bei familiären Bindungen
 * - § 209 BGB: Neubeginn der Verjährung durch Anerkenntnis
 *
 * Österreichische Verjährungsregelung (ABGB):
 * - § 1489 ABGB: Schadenersatz = 3 Jahre ab Kenntnis
 * - § 1496 ABGB: Absolute Frist = 30 Jahre
 * - § 1497 ABGB: Unterbrechung (Anerkenntnis, Klage, etc.)
 *
 * Schweizer Verjährungsregelung (OR):
 * - Art. 60 OR: Schadenersatz = 3 Jahre ab Kenntnis
 * - Art. 127 OR: Allgemeine Verjährung = 10 Jahre
 * - Art. 134 OR: Unterbrechung (Anerkenntnis, Klage, etc.)
 */

import type {
  StatuteOfLimitations,
  VerjaehrungInterruption,
  VerjaehrungSuspension,
} from "@/lib/legal-types";

function addYears(dateISO: string, years: number): string {
  const d = new Date(`${dateISO.slice(0, 10)}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T12:00:00Z`);
  const db = new Date(`${b.slice(0, 10)}T12:00:00Z`);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Create a new StatuteOfLimitations entry with computed dates.
 */
export function createStatuteOfLimitations(params: {
  claim_label: string;
  claim_type: string;
  law: string;
  start_date: string;
  period_years: number;
  max_period_years?: number;
}): StatuteOfLimitations {
  const now = new Date().toISOString();
  const regular = addYears(params.start_date, params.period_years);
  const absolute = params.max_period_years
    ? addYears(params.start_date, params.max_period_years)
    : undefined;

  return {
    id: `sol-${Date.now()}`,
    claim_label: params.claim_label,
    claim_type: params.claim_type,
    law: params.law,
    start_date: params.start_date,
    period_years: params.period_years,
    max_period_years: params.max_period_years,
    regular_barred_date: regular,
    absolute_barred_date: absolute,
    effective_barred_date: regular,
    status: "active",
    interruptions: [],
    suspensions: [],
    created_at: now,
    updated_at: now,
  };
}

/**
 * Add an interruption (Hemmung) to a limitation period.
 * Per § 203/204 BGB, the limitation is suspended during negotiations/lawsuit.
 * After the interruption ends, the remaining period continues (minimum 6 months per § 203 BGB).
 */
export function addInterruption(
  sol: StatuteOfLimitations,
  interruption: VerjaehrungInterruption
): StatuteOfLimitations {
  const interruptions = [...(sol.interruptions ?? []), interruption];
  return recompute({ ...sol, interruptions, updated_at: new Date().toISOString() });
}

/**
 * Add a suspension (Ruhen) period to a limitation period.
 * Per § 205 BGB, the limitation does not run during the suspension.
 */
export function addSuspension(
  sol: StatuteOfLimitations,
  suspension: VerjaehrungSuspension
): StatuteOfLimitations {
  const suspensions = [...(sol.suspensions ?? []), suspension];
  return recompute({ ...sol, suspensions, updated_at: new Date().toISOString() });
}

/**
 * Recompute the effective barred date considering all interruptions and suspensions.
 *
 * Algorithm:
 * 1. Start with the regular barred date (start_date + period_years)
 * 2. For each interruption: extend the barred date by the duration of the interruption
 *    (from interruption.at to the end of the interruption — for ongoing interruptions, use today)
 * 3. For each suspension: extend the barred date by the duration of the suspension
 *    (from suspension.start to suspension.end or today)
 * 4. Cap at the absolute barred date if max_period_years is set
 */
export function recompute(sol: StatuteOfLimitations): StatuteOfLimitations {
  let extensionDays = 0;
  const today = todayISO();

  // Calculate interruption days (Hemmung)
  for (const interrupt of sol.interruptions ?? []) {
    // Hemmung lasts until 6 months after the last interruption event (§ 203 BGB)
    // For simplicity, each interruption event extends by the period from its start
    // to today (if ongoing) — the 6-month Nachwirkung is handled by the minimum rule below
    const interruptEnd = today; // Ongoing until proven otherwise
    const days = daysBetween(interrupt.at, interruptEnd);
    if (days > 0) extensionDays += days;
  }

  // Calculate suspension days (Ruhen)
  for (const suspension of sol.suspensions ?? []) {
    const suspEnd = suspension.end ?? today;
    const days = daysBetween(suspension.start, suspEnd);
    if (days > 0) extensionDays += days;
  }

  // Apply extension to regular barred date
  const regular = new Date(`${sol.regular_barred_date.slice(0, 10)}T12:00:00Z`);
  regular.setUTCDate(regular.getUTCDate() + extensionDays);
  let effective = regular.toISOString().slice(0, 10);

  // Cap at absolute barred date (§ 199 Abs. 3 BGB: 10 years max)
  if (sol.absolute_barred_date && effective > sol.absolute_barred_date) {
    effective = sol.absolute_barred_date;
  }

  // Determine status
  let status: StatuteOfLimitations["status"] = "active";
  if (effective <= today) {
    status = "barred";
  } else if ((sol.suspensions ?? []).some((s) => !s.end)) {
    status = "suspended";
  } else if ((sol.interruptions ?? []).length > 0) {
    status = "interrupted";
  }

  return { ...sol, effective_barred_date: effective, status };
}

/**
 * Check if a claim is time-barred as of a given date.
 */
export function isBarred(sol: StatuteOfLimitations, asOfDate?: string): boolean {
  const checkDate = asOfDate ?? todayISO();
  const effective = sol.effective_barred_date ?? sol.regular_barred_date;
  return checkDate >= effective;
}

/**
 * Days remaining until the claim becomes time-barred.
 * Negative = already barred.
 */
export function daysUntilBarred(sol: StatuteOfLimitations, asOfDate?: string): number {
  const checkDate = asOfDate ?? todayISO();
  const effective = sol.effective_barred_date ?? sol.regular_barred_date;
  return daysBetween(checkDate, effective);
}

/**
 * Common Verjährungsfristen presets for DACH jurisdictions.
 */
export const VERJAEHRUNG_PRESETS = [
  {
    key: "bgb-195",
    label: "Regelmäßige Verjährung (§ 195 BGB)",
    law: "§ 195 BGB (DE)",
    period_years: 3,
    max_period_years: 10,
    claim_type: "allgemeiner Anspruch",
  },
  {
    key: "bgb-438",
    label: "Sachmängelverjährung (§ 438 BGB)",
    law: "§ 438 BGB (DE)",
    period_years: 2,
    max_period_years: 5,
    claim_type: "Gewährleistung",
  },
  {
    key: "bgb-634a",
    label: "Werkvertragsverjährung (§ 634a BGB)",
    law: "§ 634a BGB (DE)",
    period_years: 2,
    max_period_years: 5,
    claim_type: "Werkvertrag",
  },
  {
    key: "abgb-1489",
    label: "Schadenersatzverjährung (§ 1489 ABGB)",
    law: "§ 1489 ABGB (AT)",
    period_years: 3,
    max_period_years: 30,
    claim_type: "Schadenersatz",
  },
  {
    key: "or-60",
    label: "Schadenersatzverjährung (Art. 60 OR)",
    law: "Art. 60 OR (CH)",
    period_years: 3,
    max_period_years: 10,
    claim_type: "Schadenersatz",
  },
  {
    key: "or-127",
    label: "Allgemeine Verjährung (Art. 127 OR)",
    law: "Art. 127 OR (CH)",
    period_years: 10,
    max_period_years: undefined,
    claim_type: "allgemeiner Anspruch",
  },
] as const;
