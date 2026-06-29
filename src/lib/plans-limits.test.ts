// @vitest-environment node

import { describe, test, expect } from "vitest";
import { PLAN_LIMITS, limitsFor } from "./plans-limits";

describe("PLAN_LIMITS", () => {
  test("defines limits for all plans", () => {
    expect(Object.keys(PLAN_LIMITS)).toEqual(
      expect.arrayContaining(["free", "pro", "team", "enterprise"])
    );
  });

  test("free plan has lowest limits", () => {
    expect(PLAN_LIMITS.free.pages).toBe(200);
    expect(PLAN_LIMITS.free.queriesPerMonth).toBe(100);
    expect(PLAN_LIMITS.free.seats).toBe(1);
  });

  test("enterprise plan has highest limits", () => {
    expect(PLAN_LIMITS.enterprise.pages).toBe(1_000_000);
    expect(PLAN_LIMITS.enterprise.queriesPerMonth).toBe(15_000);
    expect(PLAN_LIMITS.enterprise.seats).toBe(25);
  });

  test("limits are monotonic across paid plans", () => {
    const plans = ["free", "pro", "team", "enterprise"] as const;
    for (let i = 0; i < plans.length - 1; i++) {
      const current = PLAN_LIMITS[plans[i]];
      const next = PLAN_LIMITS[plans[i + 1]];
      expect(next.pages).toBeGreaterThan(current.pages);
      expect(next.queriesPerMonth).toBeGreaterThan(current.queriesPerMonth);
      expect(next.seats).toBeGreaterThanOrEqual(current.seats);
    }
  });
});

describe("limitsFor", () => {
  test("returns limits for known plan", () => {
    expect(limitsFor("pro")).toBe(PLAN_LIMITS.pro);
  });

  test("returns free limits for unknown plan", () => {
    expect(limitsFor("unknown" as "free")).toBe(PLAN_LIMITS.free);
  });

  test("returns a defined limits object", () => {
    const limits = limitsFor("team");
    expect(limits.pages).toBeGreaterThan(0);
    expect(limits.queriesPerMonth).toBeGreaterThan(0);
    expect(limits.seats).toBeGreaterThan(0);
  });
});
