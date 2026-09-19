/**
 * RIS OGD usage rules, in one place.
 *
 * https://www.ris.bka.gv.at/UI/Ogd.aspx (read 2026-09-19):
 *   - no parallel connections (ris-lock.ts serializes the processes)
 *   - at most 0.5 requests per second, i.e. a 2 s pause
 *   - bulk downloads only 20:00–05:00, on weekends or Austrian public holidays
 *   - every bulk download announced beforehand to ris.it@bka.gv.at
 * Ignoring them can get the server's IP blocked, and unblocking waits for
 * their analysis — that would also stop the daily RIS delta for customers.
 */

/** Minimum pause between two RIS requests (0.5 requests per second). */
export const RIS_MIN_INTERVAL_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Easter Sunday (Gregorian, anonymous algorithm), month 1-based. */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Austrian public holidays of a year as "MM-DD". */
export function austrianHolidays(year: number): Set<string> {
  const fixed = ["01-01", "01-06", "05-01", "08-15", "10-26", "11-01", "12-08", "12-25", "12-26"];
  const { month, day } = easterSunday(year);
  const easter = Date.UTC(year, month - 1, day);
  const shifted = (days: number) => {
    const d = new Date(easter + days * 86_400_000);
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  // Easter Monday, Ascension, Whit Monday, Corpus Christi
  return new Set([...fixed, shifted(1), shifted(39), shifted(50), shifted(60)]);
}

function viennaParts(now: Date): { year: number; mmdd: string; hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    mmdd: `${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    weekday: get("weekday"),
  };
}

/** May a bulk download run now? 20:00–05:00, weekends, Austrian holidays (Vienna time). */
export function isRisBulkWindow(now = new Date()): boolean {
  const { year, mmdd, hour, weekday } = viennaParts(now);
  if (weekday === "Sat" || weekday === "Sun") return true;
  if (austrianHolidays(year).has(mmdd)) return true;
  return hour >= 20 || hour < 5;
}

let lastWaitLog = 0;

/**
 * Call before every RIS request of a bulk job: waits for the bulk window,
 * then keeps the 2 s pause.
 */
export async function risBulkPause(): Promise<void> {
  while (!isRisBulkWindow()) {
    if (Date.now() - lastWaitLog > 30 * 60_000) {
      console.log("⏸  RIS: außerhalb des erlaubten Zeitfensters (20–5 Uhr, WE, Feiertag) — warte");
      lastWaitLog = Date.now();
    }
    await sleep(5 * 60_000);
  }
  await sleep(RIS_MIN_INTERVAL_MS);
}
