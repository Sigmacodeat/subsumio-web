// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  RETENTION_DELETE_YEARS,
  RETENTION_REVIEW_YEARS,
  classifyRetention,
  isRetentionCandidate,
} from "./retention";

// The product classification used by the retention cron (not a copy of it).
describe("retention classification", () => {
  const now = new Date("2026-02-15T12:00:00Z").getTime();

  function yearsAgo(years: number): string {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString();
  }

  test("thresholds are § 132 BAO (7) and 10 years", () => {
    expect(RETENTION_REVIEW_YEARS).toBe(7);
    expect(RETENTION_DELETE_YEARS).toBe(10);
  });

  test("closed less than 7 years ago → nothing to do", () => {
    expect(classifyRetention(yearsAgo(3), now)).toBeNull();
    expect(classifyRetention(yearsAgo(6), now)).toBeNull();
  });

  test("7–10 years → review", () => {
    expect(classifyRetention(yearsAgo(7), now)).toBe("review");
    expect(classifyRetention(yearsAgo(9), now)).toBe("review");
  });

  test("10 years and more → delete", () => {
    expect(classifyRetention(yearsAgo(10), now)).toBe("delete");
    expect(classifyRetention(yearsAgo(15), now)).toBe("delete");
  });

  test("an unreadable closing date is never classified", () => {
    expect(classifyRetention("kein Datum", now)).toBeNull();
  });

  test("candidates: closed matters, never under legal hold", () => {
    expect(isRetentionCandidate({ closed_at: yearsAgo(8) })).toBe(true);
    expect(isRetentionCandidate({ status: "closed" })).toBe(true);
    expect(isRetentionCandidate({ status: "open" })).toBe(false);
    expect(isRetentionCandidate({ closed_at: yearsAgo(12), legal_hold: true })).toBe(false);
    expect(isRetentionCandidate(null)).toBe(false);
  });
});
