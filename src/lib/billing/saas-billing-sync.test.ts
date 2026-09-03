/**
 * Tests für SaaS Billing Sync — Plan-Mapping + Integration Logik.
 *
 * Verifiziert:
 *   - Plan-Mapping (pro→solo, team→kanzlei, enterprise→enterprise)
 *   - toSaasPlan / fromSaasPlan / saasPlanForUser
 *   - createSaasOrgForUser / updateSaasPlan / cancelSaasOrg (mit PGLite mock)
 *   - billMonthlyOverage (mit PGLite mock)
 */

import { describe, it, expect } from "vitest";
import { toSaasPlan, fromSaasPlan, saasPlanForUser } from "@/lib/billing/plans";

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
