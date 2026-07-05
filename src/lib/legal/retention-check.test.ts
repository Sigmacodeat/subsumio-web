// @vitest-environment node

import { describe, test, expect } from "vitest";

const RETENTION_REVIEW_YEARS = 6;
const RETENTION_DELETE_YEARS = 10;

interface RetentionCandidate {
  slug: string;
  status: string;
  closedAt: string | null;
  yearsSinceClosure: number;
  action: "review" | "delete" | null;
}

function evaluateRetention(
  status: string,
  closedAt: string | null,
  now: Date
): RetentionCandidate["action"] {
  if (status !== "archived" && status !== "closed") return null;
  if (!closedAt) return null;

  const years = (now.getTime() - new Date(closedAt).getTime()) / (1000 * 60 * 60 * 24 * 365);

  if (years >= RETENTION_DELETE_YEARS) return "delete";
  if (years >= RETENTION_REVIEW_YEARS) return "review";
  return null;
}

describe("retention evaluation logic", () => {
  const now = new Date("2026-02-15T12:00:00Z");

  function yearsAgo(years: number): string {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString();
  }

  test("returns null for open cases", () => {
    expect(evaluateRetention("open", yearsAgo(7), now)).toBeNull();
  });

  test("returns null for archived cases without closed_at", () => {
    expect(evaluateRetention("archived", null, now)).toBeNull();
  });

  test("returns null for cases closed less than 6 years ago", () => {
    expect(evaluateRetention("archived", yearsAgo(3), now)).toBeNull();
    expect(evaluateRetention("closed", yearsAgo(5), now)).toBeNull();
  });

  test("returns review for cases closed 6-10 years ago", () => {
    expect(evaluateRetention("archived", yearsAgo(6), now)).toBe("review");
    expect(evaluateRetention("closed", yearsAgo(7), now)).toBe("review");
    expect(evaluateRetention("archived", yearsAgo(9), now)).toBe("review");
  });

  test("returns delete for cases closed more than 10 years ago", () => {
    expect(evaluateRetention("archived", yearsAgo(10), now)).toBe("delete");
    expect(evaluateRetention("closed", yearsAgo(15), now)).toBe("delete");
  });

  test("boundary: exactly 6 years → review", () => {
    expect(evaluateRetention("archived", yearsAgo(6), now)).toBe("review");
  });

  test("boundary: exactly 10 years → delete", () => {
    expect(evaluateRetention("archived", yearsAgo(10), now)).toBe("delete");
  });

  test("returns null for draft status", () => {
    expect(evaluateRetention("draft", yearsAgo(15), now)).toBeNull();
  });

  test("returns null for pending status", () => {
    expect(evaluateRetention("pending", yearsAgo(15), now)).toBeNull();
  });
});
