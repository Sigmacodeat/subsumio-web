// @vitest-environment node

import { describe, it, expect } from "vitest";
import {
  FIRM_TIMEZONE,
  zonedDateString,
  zonedWallTimeToUtc,
  toZonedDateString,
  firmToday,
  firmYear,
  addDaysToDateString,
} from "@/lib/datetime";

describe("zonedDateString", () => {
  it("returns the Vienna calendar day for a UTC instant", () => {
    // 23:30 UTC on 15 March = 00:30 CEST on 16 March.
    expect(zonedDateString(new Date("2026-03-15T23:30:00Z"))).toBe("2026-03-16");
    // 10:00 UTC stays on the same Vienna day.
    expect(zonedDateString(new Date("2026-03-15T10:00:00Z"))).toBe("2026-03-15");
  });

  it("honours winter CET (+1) vs summer CEST (+2)", () => {
    // 22:30 UTC in January = 23:30 Vienna — still the same day.
    expect(zonedDateString(new Date("2099-01-15T22:30:00Z"))).toBe("2099-01-15");
    // 22:30 UTC in July = 00:30 Vienna — already the next day.
    expect(zonedDateString(new Date("2099-07-15T22:30:00Z"))).toBe("2099-07-16");
  });
});

describe("zonedWallTimeToUtc", () => {
  it("resolves a Vienna wall time to its UTC instant (winter, CET)", () => {
    expect(zonedWallTimeToUtc("2099-01-15", "09:00").toISOString()).toBe(
      "2099-01-15T08:00:00.000Z"
    );
  });

  it("resolves a Vienna wall time to its UTC instant (summer, CEST)", () => {
    expect(zonedWallTimeToUtc("2099-07-15", "09:00").toISOString()).toBe(
      "2099-07-15T07:00:00.000Z"
    );
  });

  it("is independent of the host timezone", () => {
    // The bug this fixes: on a UTC server, `new Date("…T09:00")` produced
    // 09:00 UTC = 10:00 Vienna. The zone param must win over process TZ.
    const a = zonedWallTimeToUtc("2099-07-15", "17:00", FIRM_TIMEZONE);
    const b = zonedWallTimeToUtc("2099-07-15", "17:00", FIRM_TIMEZONE);
    expect(a.getTime()).toBe(b.getTime());
    expect(zonedDateString(a)).toBe("2099-07-15");
  });
});

describe("toZonedDateString", () => {
  it("normalizes a full ISO timestamp to the Vienna day", () => {
    expect(toZonedDateString("2026-03-15T14:30:00Z")).toBe("2026-03-15");
  });

  it("keeps a plain date string on the same Vienna day", () => {
    expect(toZonedDateString("2026-03-15")).toBe("2026-03-15");
  });

  it("falls back to today for missing or invalid input", () => {
    const today = zonedDateString(new Date());
    expect(toZonedDateString(undefined)).toBe(today);
    expect(toZonedDateString("garbage")).toBe(today);
    expect(toZonedDateString(null)).toBe(today);
  });
});

describe("firmToday / firmYear (audit QA-6)", () => {
  it("New Year's night 00:30 Vienna is already the new day and year", () => {
    const newYearsNight = new Date("2026-12-31T23:30:00Z"); // 00:30 CET on 1 Jan 2027
    expect(firmToday(newYearsNight)).toBe("2027-01-01");
    expect(firmYear(newYearsNight)).toBe(2027);
  });

  it("summer time: 01:30 CEST is still the Vienna day, not the UTC day before", () => {
    expect(firmToday(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
  });

  it("addDaysToDateString crosses month, year and DST boundaries", () => {
    expect(addDaysToDateString("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateString("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDaysToDateString("2026-10-24", 14)).toBe("2026-11-07");
  });
});
