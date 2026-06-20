import { describe, test, expect } from "vitest";
import {
  BILLABLE_PLANS,
  BILLING_PLANS_DISPLAY,
  isBillingConfigured,
  stripePriceId,
  type BillablePlan,
} from "./plans";

describe("BILLABLE_PLANS", () => {
  test("contains pro and team plans", () => {
    expect(BILLABLE_PLANS.pro).toBeDefined();
    expect(BILLABLE_PLANS.team).toBeDefined();
  });

  test("pro plan has correct structure", () => {
    const pro = BILLABLE_PLANS.pro;
    expect(pro.id).toBe("pro");
    expect(pro.name).toBe("Pro");
    expect(pro.monthlyEur).toBe(290);
    expect(pro.stripePriceEnv).toBe("STRIPE_PRICE_PRO");
    expect(pro.pages).toBe(25_000);
    expect(pro.seats).toBe(1);
  });

  test("team plan has correct structure", () => {
    const team = BILLABLE_PLANS.team;
    expect(team.id).toBe("team");
    expect(team.name).toBe("Team");
    expect(team.monthlyEur).toBe(490);
    expect(team.stripePriceEnv).toBe("STRIPE_PRICE_TEAM");
    expect(team.pages).toBe(100_000);
    expect(team.seats).toBe(5);
  });

  test("team plan is more expensive than pro", () => {
    expect(BILLABLE_PLANS.team.monthlyEur).toBeGreaterThan(BILLABLE_PLANS.pro.monthlyEur);
  });

  test("team plan has more pages than pro", () => {
    expect(BILLABLE_PLANS.team.pages).toBeGreaterThan(BILLABLE_PLANS.pro.pages);
  });

  test("team plan has more seats than pro", () => {
    expect(BILLABLE_PLANS.team.seats).toBeGreaterThan(BILLABLE_PLANS.pro.seats);
  });

  test("all plans have valid stripe price env var names", () => {
    for (const plan of Object.values(BILLABLE_PLANS)) {
      expect(plan.stripePriceEnv).toMatch(/^STRIPE_PRICE_/);
      expect(plan.stripePriceEnv.length).toBeGreaterThan("STRIPE_PRICE_".length);
    }
  });

  test("all plans have positive monthlyEur", () => {
    for (const plan of Object.values(BILLABLE_PLANS)) {
      expect(plan.monthlyEur).toBeGreaterThan(0);
    }
  });

  test("all plans have positive pages", () => {
    for (const plan of Object.values(BILLABLE_PLANS)) {
      expect(plan.pages).toBeGreaterThan(0);
    }
  });

  test("all plans have positive seats", () => {
    for (const plan of Object.values(BILLABLE_PLANS)) {
      expect(plan.seats).toBeGreaterThan(0);
    }
  });
});

describe("BILLING_PLANS_DISPLAY", () => {
  test("contains 3 plans: free, pro, team", () => {
    expect(BILLING_PLANS_DISPLAY).toHaveLength(3);
    const ids = BILLING_PLANS_DISPLAY.map((p) => p.id);
    expect(ids).toContain("free");
    expect(ids).toContain("pro");
    expect(ids).toContain("team");
  });

  test("pro plan is highlighted", () => {
    const pro = BILLING_PLANS_DISPLAY.find((p) => p.id === "pro");
    expect(pro?.highlight).toBe(true);
  });

  test("free plan is not highlighted", () => {
    const free = BILLING_PLANS_DISPLAY.find((p) => p.id === "free");
    expect(free?.highlight).toBeUndefined();
  });

  test("all plans have name, price, and features", () => {
    for (const plan of BILLING_PLANS_DISPLAY) {
      expect(plan.name).toBeTruthy();
      expect(plan.price).toBeTruthy();
      expect(plan.features).toBeInstanceOf(Array);
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  test("free plan price is 0 €", () => {
    const free = BILLING_PLANS_DISPLAY.find((p) => p.id === "free");
    expect(free?.price).toContain("0");
  });

  test("pro plan price contains 290", () => {
    const pro = BILLING_PLANS_DISPLAY.find((p) => p.id === "pro");
    expect(pro?.price).toContain("290");
  });

  test("team plan price contains 490", () => {
    const team = BILLING_PLANS_DISPLAY.find((p) => p.id === "team");
    expect(team?.price).toContain("490");
  });

  test("all feature strings are non-empty", () => {
    for (const plan of BILLING_PLANS_DISPLAY) {
      for (const feature of plan.features) {
        expect(feature.length).toBeGreaterThan(3);
      }
    }
  });
});

describe("isBillingConfigured", () => {
  test("returns false when STRIPE_SECRET_KEY is not set", () => {
    const original = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    expect(isBillingConfigured()).toBe(false);
    if (original) process.env.STRIPE_SECRET_KEY = original;
  });

  test("returns true when STRIPE_SECRET_KEY is set", () => {
    const original = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    expect(isBillingConfigured()).toBe(true);
    if (original) process.env.STRIPE_SECRET_KEY = original;
    else delete process.env.STRIPE_SECRET_KEY;
  });
});

describe("stripePriceId", () => {
  test("returns null when env var is not set", () => {
    const original = process.env.STRIPE_PRICE_PRO;
    delete process.env.STRIPE_PRICE_PRO;
    expect(stripePriceId("pro")).toBeNull();
    if (original) process.env.STRIPE_PRICE_PRO = original;
  });

  test("returns the price ID when env var is set", () => {
    const original = process.env.STRIPE_PRICE_PRO;
    process.env.STRIPE_PRICE_PRO = "price_abc123";
    expect(stripePriceId("pro")).toBe("price_abc123");
    if (original) process.env.STRIPE_PRICE_PRO = original;
    else delete process.env.STRIPE_PRICE_PRO;
  });

  test("returns null for team when env var is not set", () => {
    const original = process.env.STRIPE_PRICE_TEAM;
    delete process.env.STRIPE_PRICE_TEAM;
    expect(stripePriceId("team")).toBeNull();
    if (original) process.env.STRIPE_PRICE_TEAM = original;
  });

  test("returns the price ID for team when env var is set", () => {
    const original = process.env.STRIPE_PRICE_TEAM;
    process.env.STRIPE_PRICE_TEAM = "price_team_xyz";
    expect(stripePriceId("team")).toBe("price_team_xyz");
    if (original) process.env.STRIPE_PRICE_TEAM = original;
    else delete process.env.STRIPE_PRICE_TEAM;
  });
});
