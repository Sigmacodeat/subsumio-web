/**
 * Wall-clock helpers for calendar sync (Europe/Vienna). Pure, client-safe.
 */
import { FIRM_TIMEZONE, zonedDateString } from "@/lib/datetime";

const firmTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: FIRM_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * `date` + `time` (+ `minutes`) as wall-clock date and time — rolls over into
 * the next day(s) instead of wrapping the hour back to the start date.
 */
export function addMinutesToWallClock(
  date: string,
  time: string,
  minutes: number
): { date: string; time: string } {
  const base = Date.parse(`${date}T${time}:00Z`);
  const d = new Date(base + minutes * 60_000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * A Graph `{ dateTime, timeZone }` as firm-local date and time. Events pulled
 * with `Prefer: outlook.timezone="Europe/Vienna"` already carry Vienna wall
 * time; UTC values (older pulls, the service-account connector) are converted.
 */
export function graphDateTimeToFirmLocal(
  dateTime: string | null | undefined,
  timeZone: string | null | undefined
): { date: string; time: string; ms: number } | null {
  if (!dateTime) return null;
  const raw = dateTime.replace(/\.\d+$/, "").slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return null;
  const tz = timeZone || "UTC";
  if (tz === FIRM_TIMEZONE || tz === "W. Europe Standard Time") {
    const date = raw.slice(0, 10);
    const time = raw.slice(11, 16);
    // ms only orders/measures events; wall time read as UTC is consistent.
    return { date, time, ms: Date.parse(`${raw.slice(0, 16)}:00Z`) };
  }
  const instant = new Date(`${raw}Z`);
  if (Number.isNaN(instant.getTime())) return null;
  const date = zonedDateString(instant, FIRM_TIMEZONE);
  const time = firmTimeFmt.format(instant);
  return { date, time, ms: Date.parse(`${date}T${time}:00Z`) };
}
