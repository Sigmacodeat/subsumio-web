/**
 * Tests für SaaS Billing Sync — Plan-Mapping + Integration Logik.
 *
 * Verifiziert:
 *   - Plan-Mapping (pro→solo, team→kanzlei, enterprise→enterprise)
 *   - toSaasPlan / fromSaasPlan / saasPlanForUser
 *   - createSaasOrgForUser / updateSaasPlan / cancelSaasOrg (mit PGLite mock)
 *   - billMonthlyOverage (mit PGLite mock)
 */

import { describe, it, expect, vi } from "vitest";
import { toSaasPlan, fromSaasPlan, saasPlanForUser } from "@/lib/billing/plans";

// Deterministic PGLite mode: force "no shared PG pool" regardless of whether
// a DATABASE_URL is configured in the environment.
// Individual tests may install a scripted pool (`fakePool`); reset to null.
let fakePool: unknown = null;
vi.mock("@/lib/auth/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/store")>();
  return { ...actual, getSharedPgPool: () => fakePool };
});

describe("saas-billing-sync: Plan Mapping", () => {
  describe("toSaasPlan", () => {
    it("maps pro → solo", () => {
      expect(toSaasPlan("pro")).toBe("solo");
    });
    it("maps team → kanzlei", () => {
      expect(toSaasPlan("team")).toBe("kanzlei");
    });
    it("maps enterprise → enterprise", () => {
      expect(toSaasPlan("enterprise")).toBe("enterprise");
    });
    it("maps free → null (no SaaS plan)", () => {
      expect(toSaasPlan("free")).toBeNull();
    });
  });

  describe("fromSaasPlan", () => {
    it("maps solo → pro", () => {
      expect(fromSaasPlan("solo")).toBe("pro");
    });
    it("maps kanzlei → team", () => {
      expect(fromSaasPlan("kanzlei")).toBe("team");
    });
    it("maps enterprise → enterprise", () => {
      expect(fromSaasPlan("enterprise")).toBe("enterprise");
    });
  });

  describe("saasPlanForUser", () => {
    it("resolves pro user → solo", () => {
      expect(saasPlanForUser("pro")).toBe("solo");
    });
    it("resolves team user → kanzlei", () => {
      expect(saasPlanForUser("team")).toBe("kanzlei");
    });
    it("resolves free user → null", () => {
      expect(saasPlanForUser("free")).toBeNull();
    });
    it("resolves unknown plan → null", () => {
      expect(saasPlanForUser("unknown")).toBeNull();
    });
  });
});

describe("saas-billing-sync: SaaS Billing Functions (PGLite mode)", () => {
  // In PGLite mode (no shared PG pool), all functions should return null/void
  // gracefully without throwing. This is the dev/self-hosted path.

  it("createSaasOrgForUser returns null when no PG pool (PGLite)", async () => {
    const { createSaasOrgForUser } = await import("@/lib/billing/saas-billing-sync");
    const result = await createSaasOrgForUser(
      "user-123",
      "test@example.com",
      "pro",
      "cus_123",
      "sub_123"
    );
    expect(result).toBeNull();
  });

  it("updateSaasPlan does not throw when no PG pool (PGLite)", async () => {
    const { updateSaasPlan } = await import("@/lib/billing/saas-billing-sync");
    await expect(updateSaasPlan("user-123", "pro")).resolves.toBeUndefined();
  });

  it("cancelSaasOrg does not throw when no PG pool (PGLite)", async () => {
    const { cancelSaasOrg } = await import("@/lib/billing/saas-billing-sync");
    await expect(cancelSaasOrg("user-123")).resolves.toBeUndefined();
  });

  it("billMonthlyOverage returns zeros when no PG pool (PGLite)", async () => {
    const { billMonthlyOverage } = await import("@/lib/billing/saas-billing-sync");
    const result = await billMonthlyOverage();
    expect(result.orgs).toBe(0);
    expect(result.invoices).toBe(0);
  });

  it("resetMonthlyPeriod returns zeros when no PG pool (PGLite)", async () => {
    const { resetMonthlyPeriod } = await import("@/lib/billing/saas-billing-sync");
    const result = await resetMonthlyPeriod();
    expect(result.orgs).toBe(0);
    expect(result.rows).toBe(0);
  });

  it("reactivateSaasSubscription does not throw when no PG pool (PGLite)", async () => {
    const { reactivateSaasSubscription } = await import("@/lib/billing/saas-billing-sync");
    await expect(reactivateSaasSubscription("user-123")).resolves.toBeUndefined();
  });

  it("updateSaasSeats does not throw when no PG pool (PGLite)", async () => {
    const { updateSaasSeats } = await import("@/lib/billing/saas-billing-sync");
    await expect(updateSaasSeats("user-123", 10)).resolves.toBeUndefined();
  });
});

// ── GELD-6: purchased credits are used once, not regenerated monthly ──────

describe("saas-billing-sync: gekaufte Credits (Rest-Übertrag)", () => {
  it("unusedPurchasedCredit: inkl. 60, gekauft 100, verbraucht 160 → Rest 0", async () => {
    const { unusedPurchasedCredit } = await import("@/lib/billing/saas-billing-sync");
    expect(unusedPurchasedCredit({ included: 60, purchased: 100, used: 160 })).toBe(0);
  });

  it("unusedPurchasedCredit: verbraucht 100 → 40 aus dem Kauf, Rest 60", async () => {
    const { unusedPurchasedCredit } = await import("@/lib/billing/saas-billing-sync");
    expect(unusedPurchasedCredit({ included: 60, purchased: 100, used: 100 })).toBe(60);
  });

  it("unusedPurchasedCredit: Verbrauch innerhalb der Inklusiv-Credits lässt den Kauf unberührt", async () => {
    const { unusedPurchasedCredit } = await import("@/lib/billing/saas-billing-sync");
    expect(unusedPurchasedCredit({ included: 60, purchased: 100, used: 40 })).toBe(100);
    expect(unusedPurchasedCredit({ included: 60, purchased: 100, used: 300 })).toBe(0);
  });

  it("monthlyOverage rechnet nur gegen die verfügbaren gekauften Credits", async () => {
    const { monthlyOverage } = await import("@/lib/billing/saas-billing-sync");
    expect(monthlyOverage({ usage: 160, included: 60, purchasedAvailable: 100 })).toBe(0);
    // Pack already used up last month: nothing left to cover this month's overage.
    expect(monthlyOverage({ usage: 160, included: 60, purchasedAvailable: 0 })).toBe(100);
    expect(monthlyOverage({ usage: 160, included: 60, purchasedAvailable: 60 })).toBe(40);
  });

  /** Scripted pool: answers the queries resetMonthlyPeriod / billMonthlyOverage send. */
  function scriptedPool(prev: Record<string, number> | null, periodPurchased: number) {
    const inserts: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/FROM saas_orgs o/.test(sql)) {
          return { rows: [{ id: "org-1", plan: "solo", seats: 1 }] };
        }
        if (/SELECT id FROM saas_invoices/.test(sql)) return { rows: [] };
        if (/FROM saas_usage_ledger/.test(sql)) {
          return { rows: [{ total_sell: 160, total_cost: 80 }] };
        }
        if (/FROM saas_credit_balance/.test(sql)) {
          if (/used_credit/.test(sql)) return { rows: prev ? [prev] : [] };
          return { rows: [{ purchased_credit: periodPurchased }] };
        }
        if (/INSERT INTO/.test(sql)) {
          inserts.push({ sql, params });
          return { rows: [{ id: 1, org_id: "org-1" }] };
        }
        return { rows: [] };
      },
    };
    return { pool, inserts };
  }

  it("resetMonthlyPeriod überträgt nach vollem Verbrauch 0 gekaufte Credits", async () => {
    const { resetMonthlyPeriod } = await import("@/lib/billing/saas-billing-sync");
    const s = scriptedPool({ included_credit: 60, purchased_credit: 100, used_credit: 160 }, 0);
    fakePool = s.pool;
    try {
      await resetMonthlyPeriod();
    } finally {
      fakePool = null;
    }
    const insert = s.inserts.find((i) => /saas_credit_balance/.test(i.sql))!;
    expect(insert.params[4]).toBe(0);
  });

  it("resetMonthlyPeriod überträgt den Rest (verbraucht 100 → 60)", async () => {
    const { resetMonthlyPeriod } = await import("@/lib/billing/saas-billing-sync");
    const s = scriptedPool({ included_credit: 60, purchased_credit: 100, used_credit: 100 }, 0);
    fakePool = s.pool;
    try {
      await resetMonthlyPeriod();
    } finally {
      fakePool = null;
    }
    const insert = s.inserts.find((i) => /saas_credit_balance/.test(i.sql))!;
    expect(insert.params[4]).toBe(60);
  });

  it("billMonthlyOverage nutzt nur den verfügbaren Rest gekaufter Credits", async () => {
    const { billMonthlyOverage } = await import("@/lib/billing/saas-billing-sync");
    const { PLANS } = await import("../../../server/src/core/saas-pricing");
    const included = PLANS.solo.included_credit;
    const s = scriptedPool(null, 0);
    fakePool = s.pool;
    try {
      await billMonthlyOverage();
    } finally {
      fakePool = null;
    }
    const insert = s.inserts.find((i) => /saas_invoices/.test(i.sql))!;
    // params: org, start, end, seats, seat_subtotal, included, usage, overage, total
    expect(insert.params[7]).toBe(Math.max(0, 160 - included));
  });
});
