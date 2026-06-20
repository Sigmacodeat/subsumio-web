// @vitest-environment node

import { describe, test, expect } from "vitest";
import { PLAN_LIMITS, limitsFor } from "./plans";
import type { Plan } from "@/lib/auth/store";

describe("PLAN_LIMITS", () => {
  test("has all four plans", () => {
    expect(PLAN_LIMITS.free).toBeDefined();
    expect(PLAN_LIMITS.pro).toBeDefined();
    expect(PLAN_LIMITS.team).toBeDefined();
    expect(PLAN_LIMITS.enterprise).toBeDefined();
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

  test("limits increase monotonically", () => {
    const plans: Plan[] = ["free", "pro", "team", "enterprise"];
    for (let i = 0; i < plans.length - 1; i++) {
      expect(PLAN_LIMITS[plans[i]].pages).toBeLessThan(PLAN_LIMITS[plans[i + 1]].pages);
      expect(PLAN_LIMITS[plans[i]].queriesPerMonth).toBeLessThan(
        PLAN_LIMITS[plans[i + 1]].queriesPerMonth
      );
      expect(PLAN_LIMITS[plans[i]].seats).toBeLessThanOrEqual(PLAN_LIMITS[plans[i + 1]].seats);
    }
  });
});

describe("limitsFor", () => {
  test("returns correct limits for each plan", () => {
    expect(limitsFor("free")).toEqual(PLAN_LIMITS.free);
    expect(limitsFor("pro")).toEqual(PLAN_LIMITS.pro);
    expect(limitsFor("team")).toEqual(PLAN_LIMITS.team);
    expect(limitsFor("enterprise")).toEqual(PLAN_LIMITS.enterprise);
  });

  test("falls back to free for unknown plan", () => {
    expect(limitsFor("unknown" as Plan)).toEqual(PLAN_LIMITS.free);
  });
});
