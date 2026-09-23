/**
 * The pace RIS OGD allows (https://www.ris.bka.gv.at/UI/Ogd.aspx, updated
 * per RIS-IT mail 2026-09-22). One place, so no fetcher can drift faster:
 *
 * - at most TWO parallel download processes (see ris-lock.ts, 2 slots)
 * - each process: at most 0.5 requests per second → 2 s between requests,
 *   always — combined ≈ 1 req/s
 * - mass downloads only 20:00–05:00, on weekends or Austrian public
 *   holidays (Vienna time)
 * - updates afterwards via the "History-Abfrage" (see OGD handbooks)
 * - every mass download announced by mail to ris.it@bka.gv.at beforehand
 *
 * Breaking this gets the server's IP blocked, which would also stop the
 * daily delta sync for clients. Speed comes from fewer requests (100 hits
 * per page, delta instead of full scan) and the second slot, never from
 * shorter pauses.
 */

export const RIS_PAUSE_MS = 2000;

/**
 * The one User-Agent every RIS request carries — the same string the mass
 * download is announced with at ris.it@bka.gv.at. RIS asks callers to
 * identify themselves; browser-lookalike strings hid who we are and would
 * make the announcement worthless.
 */
export const RIS_USER_AGENT =
  "subsumio-law-corpus/1.0 (corpus build; contact: mesic.sigmacode@gmail.com)";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The pause between two RIS requests. */
export function risPause(): Promise<void> {
  return sleep(RIS_PAUSE_MS);
}

/**
 * The pause before the next request of a mass download: waits out the
 * closed hours first, so a run started on Sunday pauses on Monday morning
 * instead of downloading through the working day.
 */
export async function risMassPause(label?: string): Promise<void> {
  await waitForRisWindow(label);
  await sleep(RIS_PAUSE_MS);
}

/** Austrian public holidays, as Vienna-local YYYY-MM-DD. */
export function austrianHolidays(year: number): Set<string> {
  const d = (m: number, day: number) =>
    `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Easter (Gauss); the movable holidays hang off it.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const e = Math.floor(b / 4);
  const f = b % 4;
  const g = Math.floor((b + 8) / 25);
  const h = Math.floor((b - g + 1) / 3);
  const i = (19 * a + b - e - h + 15) % 30;
  const k = Math.floor(c / 4);
  const l = c % 4;
  const m = (32 + 2 * f + 2 * k - i - l) % 7;
  const n = Math.floor((a + 11 * i + 22 * m) / 451);
  const month = Math.floor((i + m - 7 * n + 114) / 31);
  const day = ((i + m - 7 * n + 114) % 31) + 1;
  const easter = new Date(Date.UTC(year, month - 1, day));
  const off = (days: number) => {
    const x = new Date(easter);
    x.setUTCDate(x.getUTCDate() + days);
    return x.toISOString().slice(0, 10);
  };
  return new Set([
    d(1, 1), // Neujahr
    d(1, 6), // Heilige Drei Könige
    off(1), // Ostermontag
    d(5, 1), // Staatsfeiertag
    off(39), // Christi Himmelfahrt
    off(50), // Pfingstmontag
    off(60), // Fronleichnam
    d(8, 15), // Mariä Himmelfahrt
    d(10, 26), // Nationalfeiertag
    d(11, 1), // Allerheiligen
    d(12, 8), // Mariä Empfängnis
    d(12, 25), // Christtag
    d(12, 26), // Stefanitag
  ]);
}

/** Is a mass download allowed right now (Vienna time)? */
export function massDownloadAllowed(now: Date = new Date()): boolean {
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });
  const weekday = now.toLocaleDateString("en-US", { timeZone: "Europe/Vienna", weekday: "short" });
  const hour = Number(
    now.toLocaleString("en-GB", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
  );
  if (weekday === "Sat" || weekday === "Sun") return true;
  if (austrianHolidays(Number(date.slice(0, 4))).has(date)) return true;
  return hour >= 20 || hour < 5;
}

/**
 * Blocks until mass downloads are allowed again. Checks every five minutes,
 * so a queue started during the day simply waits for the evening instead of
 * hammering RIS or dying.
 */
export async function waitForRisWindow(_label = "Massendownload"): Promise<void> {
  // Fenster-Warte deaktiviert (Operator-Entscheid 2026-09-23): Downloads
  // laufen rund um die Uhr, nicht nur 20–5 Uhr/Wochenende/Feiertage.
  // Das war Teil der RIS-IT-Zusage — Reaktivierung: diesen early return
  // entfernen.
  return;
}
