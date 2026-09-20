import { describe, expect, test } from "bun:test";
import { austrianHolidays, massDownloadAllowed, RIS_PAUSE_MS } from "../scripts/ris-pace.ts";

/** A moment in Vienna local time. */
const vienna = (iso: string, offset = "+02:00") => new Date(`${iso}${offset}`);

describe("RIS OGD pace", () => {
  test("at most 0.5 requests per second", () => {
    expect(RIS_PAUSE_MS).toBeGreaterThanOrEqual(2000);
  });

  test("mass downloads run at night, on weekends and on holidays", () => {
    // Wednesday 22:30 and 03:00 — inside 20:00–05:00.
    expect(massDownloadAllowed(vienna("2026-09-16T22:30:00"))).toBe(true);
    expect(massDownloadAllowed(vienna("2026-09-17T03:00:00"))).toBe(true);
    // Saturday and Sunday midday.
    expect(massDownloadAllowed(vienna("2026-09-19T12:00:00"))).toBe(true);
    expect(massDownloadAllowed(vienna("2026-09-20T12:00:00"))).toBe(true);
    // Nationalfeiertag, a Monday in 2026.
    expect(massDownloadAllowed(vienna("2026-10-26T12:00:00", "+01:00"))).toBe(true);
  });

  test("not during working hours on a working day", () => {
    expect(massDownloadAllowed(vienna("2026-09-16T09:00:00"))).toBe(false);
    expect(massDownloadAllowed(vienna("2026-09-16T19:59:00"))).toBe(false);
    expect(massDownloadAllowed(vienna("2026-09-17T05:00:00"))).toBe(false);
  });

  test("the movable holidays hang off Easter", () => {
    const h = austrianHolidays(2026);
    expect(h.has("2026-04-06")).toBe(true); // Ostermontag
    expect(h.has("2026-05-14")).toBe(true); // Christi Himmelfahrt
    expect(h.has("2026-06-04")).toBe(true); // Fronleichnam
    expect(h.has("2026-10-26")).toBe(true); // Nationalfeiertag
    expect(h.has("2026-09-16")).toBe(false);
  });
});

describe("RIS identity", () => {
  test("one honest User-Agent, no browser disguise", async () => {
    const { RIS_USER_AGENT } = await import("../scripts/ris-pace.ts");
    const { getUserAgent } = await import("../scripts/ris-proxy.ts");
    expect(RIS_USER_AGENT).toBe("subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)");
    expect(getUserAgent()).toBe(RIS_USER_AGENT);
    expect(getUserAgent()).not.toContain("Mozilla");
  });
});
