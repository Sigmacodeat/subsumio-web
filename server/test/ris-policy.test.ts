import { describe, expect, test } from "bun:test";
import { austrianHolidays, isRisBulkWindow, RIS_MIN_INTERVAL_MS } from "../scripts/ris-policy.ts";

// Vienna is UTC+2 in summer, UTC+1 in winter.
const vienna = (iso: string) => new Date(iso);

describe("RIS OGD policy", () => {
  test("pause is 2 s (0.5 requests per second)", () => {
    expect(RIS_MIN_INTERVAL_MS).toBe(2000);
  });

  test("weekday office hours are closed, evening and night are open", () => {
    // Mon 2026-09-21
    expect(isRisBulkWindow(vienna("2026-09-21T10:00:00+02:00"))).toBe(false);
    expect(isRisBulkWindow(vienna("2026-09-21T19:59:00+02:00"))).toBe(false);
    expect(isRisBulkWindow(vienna("2026-09-21T20:00:00+02:00"))).toBe(true);
    expect(isRisBulkWindow(vienna("2026-09-22T04:59:00+02:00"))).toBe(true);
    expect(isRisBulkWindow(vienna("2026-09-22T05:00:00+02:00"))).toBe(false);
  });

  test("weekends are open all day", () => {
    expect(isRisBulkWindow(vienna("2026-09-19T12:00:00+02:00"))).toBe(true); // Sat
    expect(isRisBulkWindow(vienna("2026-09-20T12:00:00+02:00"))).toBe(true); // Sun
  });

  test("Austrian holidays are open, including the Easter-based ones", () => {
    const h = austrianHolidays(2026); // Easter Sunday 2026-04-05
    expect(h.has("10-26")).toBe(true); // Nationalfeiertag
    expect(h.has("04-06")).toBe(true); // Ostermontag
    expect(h.has("05-14")).toBe(true); // Christi Himmelfahrt
    expect(h.has("05-25")).toBe(true); // Pfingstmontag
    expect(h.has("06-04")).toBe(true); // Fronleichnam
    expect(isRisBulkWindow(vienna("2026-10-26T11:00:00+01:00"))).toBe(true); // Mon, holiday
  });
});
