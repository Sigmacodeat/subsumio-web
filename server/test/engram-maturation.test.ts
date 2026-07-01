/**
 * v0.45 — Engram Maturation + Reconsolidation unit tests.
 *
 * Tests the pure sigmoid activation function and maturation state helpers.
 * No DB required — all tests are pure-function.
 */

import { describe, test, expect } from "bun:test";
import {
  computeActivation,
  isExplicit,
  isImplicit,
  isSilent,
  maturationLabel,
  shouldBackfill,
  DEFAULT_MATURATION_HALF_LIFE_HOURS,
  EXPLICIT_THRESHOLD,
  SILENT_THRESHOLD,
} from "../src/core/engram-maturation.ts";

const MS_PER_HOUR = 1000 * 60 * 60;

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * MS_PER_HOUR);
}

describe("computeActivation — sigmoid maturation curve", () => {
  test("brand new fact (0h old) has activation 0", () => {
    const now = new Date();
    const a = computeActivation(now, now);
    expect(a).toBe(0);
  });

  test("fact at exactly t_half (168h) has activation ~0.5", () => {
    const created = hoursAgo(DEFAULT_MATURATION_HALF_LIFE_HOURS);
    const a = computeActivation(created);
    expect(a).toBeCloseTo(0.5, 1);
  });

  test("fact younger than t_half is below 0.5 (implicit/silent)", () => {
    const created = hoursAgo(24); // 1 day old
    const a = computeActivation(created);
    expect(a).toBeLessThan(EXPLICIT_THRESHOLD);
    expect(a).toBeGreaterThan(0);
  });

  test("fact older than t_half is above 0.5 (explicit)", () => {
    const created = hoursAgo(24 * 10); // 10 days old
    const a = computeActivation(created);
    expect(a).toBeGreaterThan(EXPLICIT_THRESHOLD);
    expect(a).toBeLessThan(1.0);
  });

  test("fact much older than t_half approaches 1.0", () => {
    const created = hoursAgo(24 * 30); // 30 days old
    const a = computeActivation(created);
    expect(a).toBeGreaterThan(0.99);
  });

  test("activation is monotonically non-decreasing with age", () => {
    const now = new Date();
    const ages = [0, 1, 12, 24, 48, 96, 168, 240, 336, 504, 720];
    let prev = -1;
    for (const age of ages) {
      const created = new Date(now.getTime() - age * MS_PER_HOUR);
      const a = computeActivation(created, now);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  test("activation is always in [0, 1]", () => {
    const now = new Date();
    // Test edge cases: future date, very old date, zero age
    const future = new Date(now.getTime() + 1000);
    const veryOld = new Date(now.getTime() - 365 * 24 * MS_PER_HOUR);
    expect(computeActivation(future, now)).toBe(0);
    expect(computeActivation(now, now)).toBe(0);
    expect(computeActivation(veryOld, now)).toBeLessThanOrEqual(1.0);
    expect(computeActivation(veryOld, now)).toBeGreaterThanOrEqual(0);
  });

  test("custom params change the curve shape", () => {
    const created = hoursAgo(48); // 2 days old
    // With a 2-day half-life, 2 days should be ~0.5
    const a2 = computeActivation(created, new Date(), { halfLifeHours: 48 });
    expect(a2).toBeCloseTo(0.5, 1);

    // With a 14-day half-life, 2 days should be well below 0.5
    const a14 = computeActivation(created, new Date(), { halfLifeHours: 336 });
    expect(a14).toBeLessThan(0.3);
  });
});

describe("maturation state helpers", () => {
  test("isSilent returns true for near-zero activation", () => {
    expect(isSilent(0)).toBe(true);
    expect(isSilent(0.01)).toBe(true);
    expect(isSilent(SILENT_THRESHOLD)).toBe(true);
  });

  test("isSilent returns false above threshold", () => {
    expect(isSilent(0.1)).toBe(false);
    expect(isSilent(0.5)).toBe(false);
  });

  test("isImplicit returns true between silent and explicit thresholds", () => {
    expect(isImplicit(0.1)).toBe(true);
    expect(isImplicit(0.3)).toBe(true);
    expect(isImplicit(0.49)).toBe(true);
  });

  test("isImplicit returns false at boundaries", () => {
    expect(isImplicit(0)).toBe(false);
    expect(isImplicit(0.03)).toBe(false);
    expect(isImplicit(0.5)).toBe(false);
    expect(isImplicit(0.9)).toBe(false);
  });

  test("isExplicit returns true at and above 0.5", () => {
    expect(isExplicit(0.5)).toBe(true);
    expect(isExplicit(0.7)).toBe(true);
    expect(isExplicit(1.0)).toBe(true);
  });

  test("isExplicit returns false below 0.5", () => {
    expect(isExplicit(0.49)).toBe(false);
    expect(isExplicit(0.3)).toBe(false);
    expect(isExplicit(0)).toBe(false);
  });

  test("maturationLabel returns correct label for each state", () => {
    expect(maturationLabel(0)).toBe("silent");
    expect(maturationLabel(0.01)).toBe("silent");
    expect(maturationLabel(0.1)).toBe("implicit");
    expect(maturationLabel(0.3)).toBe("implicit");
    expect(maturationLabel(0.5)).toBe("explicit");
    expect(maturationLabel(0.9)).toBe("explicit");
    expect(maturationLabel(1.0)).toBe("explicit");
  });
});

describe("shouldBackfill", () => {
  test("returns true for facts older than 7 days", () => {
    const old = hoursAgo(24 * 8); // 8 days
    expect(shouldBackfill(old)).toBe(true);
  });

  test("returns false for facts younger than 7 days", () => {
    const young = hoursAgo(24 * 3); // 3 days
    expect(shouldBackfill(young)).toBe(false);
  });

  test("returns false for exactly 7 days (boundary)", () => {
    const exact = hoursAgo(DEFAULT_MATURATION_HALF_LIFE_HOURS);
    // 168h is NOT > 168h, so should be false
    expect(shouldBackfill(exact)).toBe(false);
  });
});
