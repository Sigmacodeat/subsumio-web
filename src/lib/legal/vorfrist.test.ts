import { describe, it, expect } from "vitest";
import {
  computeVorfrist,
  shouldHaveVorfrist,
  isVorfristReached,
  daysUntilVorfrist,
} from "@/lib/legal/vorfrist";

describe("computeVorfrist", () => {
  it("computes a Vorfrist 7 days before the deadline", () => {
    const result = computeVorfrist("2026-07-20");
    expect(result).toBe("2026-07-13");
  });

  it("rolls forward to Monday if Vorfrist falls on Saturday", () => {
    // 2026-07-25 is a Saturday → Vorfrist 7 days before = 2026-07-18 (Saturday)
    // Should roll to Monday 2026-07-20
    const result = computeVorfrist("2026-07-25");
    expect(result).toBe("2026-07-20");
  });

  it("rolls forward to Monday if Vorfrist falls on Sunday", () => {
    // 2026-07-26 is a Sunday → Vorfrist 7 days before = 2026-07-19 (Sunday)
    // Should roll to Monday 2026-07-20
    const result = computeVorfrist("2026-07-26");
    expect(result).toBe("2026-07-20");
  });

  it("supports custom vorfristDays", () => {
    const result = computeVorfrist("2026-07-20", 3);
    expect(result).toBe("2026-07-17");
  });

  it("returns null for invalid date", () => {
    expect(computeVorfrist("invalid")).toBeNull();
    expect(computeVorfrist("")).toBeNull();
  });

  it("handles German holiday (Corpus Christi, BW)", () => {
    // Corpus Christi 2026 is June 4 (Thursday) in BW
    // Deadline: 2026-06-11 → Vorfrist 7 days = 2026-06-04 (Corpus Christi)
    // Should roll to Friday 2026-06-05
    const result = computeVorfrist("2026-06-11", 7, "BW", "DE");
    expect(result).toBe("2026-06-05");
  });
});

describe("shouldHaveVorfrist", () => {
  it("always returns true for Notfristen", () => {
    expect(shouldHaveVorfrist(true, 0)).toBe(true);
    expect(shouldHaveVorfrist(true, undefined)).toBe(true);
  });

  it("returns false for non-Notfrist with 0 days", () => {
    expect(shouldHaveVorfrist(false, 0)).toBe(false);
    expect(shouldHaveVorfrist(false, undefined)).toBe(false);
  });

  it("returns true for non-Notfrist with >0 days", () => {
    expect(shouldHaveVorfrist(false, 7)).toBe(true);
    expect(shouldHaveVorfrist(false, 3)).toBe(true);
  });
});

describe("isVorfristReached", () => {
  it("returns true when today is at or past the Vorfrist", () => {
    expect(isVorfristReached("2026-01-01", "2026-01-02")).toBe(true);
    expect(isVorfristReached("2026-01-01", "2026-01-01")).toBe(true);
  });

  it("returns false when today is before the Vorfrist", () => {
    expect(isVorfristReached("2026-01-05", "2026-01-01")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isVorfristReached(null)).toBe(false);
    expect(isVorfristReached(undefined)).toBe(false);
  });
});

describe("daysUntilVorfrist", () => {
  it("returns positive days when Vorfrist is in the future", () => {
    expect(daysUntilVorfrist("2026-01-10", "2026-01-05")).toBe(5);
  });

  it("returns negative days when Vorfrist has passed", () => {
    expect(daysUntilVorfrist("2026-01-01", "2026-01-05")).toBe(-4);
  });

  it("returns 0 when today is the Vorfrist", () => {
    expect(daysUntilVorfrist("2026-01-05", "2026-01-05")).toBe(0);
  });

  it("returns null for missing Vorfrist", () => {
    expect(daysUntilVorfrist(null)).toBeNull();
    expect(daysUntilVorfrist(undefined)).toBeNull();
  });
});
