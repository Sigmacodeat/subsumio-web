/** Current month as "YYYY-MM" (local timezone). */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Firm calendar timezone. Subsumio is DACH-only — Europe/Vienna covers
 * AT/DE/CH civil time (all of them share CET/CEST).
 */
export const FIRM_TIMEZONE = "Europe/Vienna";

const zonedDateFormatters = new Map<string, Intl.DateTimeFormat>();
const zonedWallFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedDateFmt(timeZone: string): Intl.DateTimeFormat {
  let fmt = zonedDateFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    zonedDateFormatters.set(timeZone, fmt);
  }
  return fmt;
}

function zonedWallFmt(timeZone: string): Intl.DateTimeFormat {
  let fmt = zonedWallFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    zonedWallFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** The calendar day `d` falls on in `timeZone`, as "YYYY-MM-DD". */
export function zonedDateString(d: Date, timeZone: string = FIRM_TIMEZONE): string {
  return zonedDateFmt(timeZone).format(d);
}

/** Wall-clock reading of `d` in `timeZone`, as "YYYY-MM-DDTHH:mm:ss". */
function zonedWallTime(d: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    zonedWallFmt(timeZone)
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads
 * `dateIso` `hhmm` (e.g. "2026-03-15", "09:30"). Needed whenever the server
 * TZ is not the firm's TZ — `new Date("2026-03-15T09:30")` would silently
 * shift bookings by the UTC offset otherwise.
 *
 * Iterates because the zone offset depends on the instant itself
 * (CET/CEST): interpret the wall time as UTC, then repeatedly correct by
 * the residual `wall(t) − target` — NOT by the raw offset, which would
 * overshoot and diverge. Converges for every civil time outside the
 * nonexistent 02:00–03:00 spring-forward gap.
 */
export function zonedWallTimeToUtc(
  dateIso: string,
  hhmm: string,
  timeZone: string = FIRM_TIMEZONE
): Date {
  const targetMs = new Date(`${dateIso}T${hhmm}:00.000Z`).getTime();
  let t = new Date(targetMs);
  for (let i = 0; i < 4; i++) {
    const wall = zonedWallTime(t, timeZone);
    const err = new Date(`${wall}Z`).getTime() - targetMs;
    if (err === 0) break;
    t = new Date(t.getTime() - err);
  }
  return t;
}

/**
 * Normalize an ISO timestamp or date string to the firm's calendar day
 * ("YYYY-MM-DD" in `timeZone`). Missing or unparseable input falls back to
 * today — a time entry with a broken date poisons the lexicographic
 * from/to filters downstream.
 */
export function toZonedDateString(iso?: string | null, timeZone: string = FIRM_TIMEZONE): string {
  if (!iso) return zonedDateString(new Date(), timeZone);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return zonedDateString(new Date(), timeZone);
  return zonedDateString(d, timeZone);
}

/**
 * Today's firm calendar day ("YYYY-MM-DD", Europe/Vienna). Server code runs
 * in UTC: `new Date().toISOString().slice(0, 10)` still names yesterday
 * between 00:00 and 01:00/02:00 Vienna time.
 */
export function firmToday(now: Date = new Date()): string {
  return zonedDateString(now);
}

/** The firm's current calendar year (Europe/Vienna) — for number ranges. */
export function firmYear(now: Date = new Date()): number {
  return Number(firmToday(now).slice(0, 4));
}

/** Calendar day `days` after the ISO day `dateIso` ("YYYY-MM-DD"), DST-safe. */
export function addDaysToDateString(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
