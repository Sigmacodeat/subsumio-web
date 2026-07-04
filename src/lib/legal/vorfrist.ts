/**
 * vorfrist.ts — Vorfrist computation for the web deadline system.
 *
 * The Vorfrist is an internal control deadline that precedes the actual
 * legal deadline by a configurable number of days (default: 7). It gives
 * the Kanzlei a buffer to react before the real deadline expires.
 *
 * Rules (aligned with frist-engine.ts / fristenbuch.ts):
 *   - Default: 7 calendar days before the main deadline
 *   - Rolled forward to the next workday if it falls on Sa/So/Feiertag
 *   - Notfristen (statutory deadlines) always get a Vorfrist
 *   - Organisatorische Fristen: optional, configurable per deadline
 */

import { nextWorkday, type Bundesland, type Canton } from "@/lib/legal-deadlines";

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function parseISO(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
}

/**
 * Compute the Vorfrist date for a given deadline.
 *
 * @param dueDateISO  The main deadline date (YYYY-MM-DD)
 * @param vorfristDays  Number of calendar days before the deadline (default: 7)
 * @param state  Optional Bundesland/Kanton for holiday-aware roll-forward
 * @param country  Optional country code for holiday calculation
 * @returns ISO date string of the Vorfrist, or null if dueDateISO is invalid
 */
export function computeVorfrist(
  dueDateISO: string,
  vorfristDays = 7,
  state?: Bundesland | Canton,
  country?: "DE" | "AT" | "CH"
): string | null {
  if (!dueDateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dueDateISO.slice(0, 10))) {
    return null;
  }
  const due = parseISO(dueDateISO);
  const raw = new Date(due);
  raw.setUTCDate(raw.getUTCDate() - vorfristDays);
  const rolled = nextWorkday(raw, state, country);
  return toISODate(rolled.date);
}

/**
 * Determine whether a deadline should have a Vorfrist.
 * Notfristen (statutory deadlines) always get one.
 * Non-statutory deadlines get one if vorfristDays > 0.
 */
export function shouldHaveVorfrist(isNotfrist: boolean, vorfristDays?: number): boolean {
  if (isNotfrist) return true;
  return (vorfristDays ?? 0) > 0;
}

/**
 * Check if today's date is at or past the Vorfrist date.
 */
export function isVorfristReached(
  vorfristISO: string | null | undefined,
  todayISO?: string
): boolean {
  if (!vorfristISO) return false;
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  return today >= vorfristISO.slice(0, 10);
}

/**
 * Days remaining until the Vorfrist.
 * Negative = Vorfrist already passed.
 */
export function daysUntilVorfrist(
  vorfristISO: string | null | undefined,
  todayISO?: string
): number | null {
  if (!vorfristISO) return null;
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const t = parseISO(today);
  const v = parseISO(vorfristISO);
  return Math.round((v.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}
