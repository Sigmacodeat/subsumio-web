import { describe, test, expect } from "vitest";
import {
  LEGAL_ONLY_PAGES,
  TAX_ONLY_PAGES,
  isPathAllowedForIndustry,
  isApiPathAllowedForIndustry,
  redirectForIndustry,
} from "./industry-guards";

describe("industry-guards", () => {
  describe("isPathAllowedForIndustry", () => {
    test("legal user can access legal-only pages", () => {
      expect(isPathAllowedForIndustry("/dashboard/cases", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/drafting", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/litigation", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/litigation/some-case", "legal")).toBe(true);
    });

    test("tax user cannot access legal-only pages", () => {
      expect(isPathAllowedForIndustry("/dashboard/cases", "tax")).toBe(false);
      expect(isPathAllowedForIndustry("/dashboard/drafting", "tax")).toBe(false);
      expect(isPathAllowedForIndustry("/dashboard/litigation", "tax")).toBe(false);
      expect(isPathAllowedForIndustry("/dashboard/research", "tax")).toBe(false);
      expect(isPathAllowedForIndustry("/dashboard/bea", "tax")).toBe(false);
    });

    test("tax user can access tax-only pages", () => {
      expect(isPathAllowedForIndustry("/dashboard/tax-returns", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/tax-assessments", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/tax-audit", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/tax-deadlines", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/tax-stbvv", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/elster", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/tax-returns/some-id", "tax")).toBe(true);
    });

    test("legal user cannot access tax-only pages", () => {
      expect(isPathAllowedForIndustry("/dashboard/tax-returns", "legal")).toBe(false);
      expect(isPathAllowedForIndustry("/dashboard/tax-assessments", "legal")).toBe(false);
      expect(isPathAllowedForIndustry("/dashboard/elster", "legal")).toBe(false);
    });

    test("shared pages are allowed for both industries", () => {
      expect(isPathAllowedForIndustry("/dashboard", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/contacts", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/contacts", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/vault", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/vault", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/billing", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/billing", "tax")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/settings", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/settings", "tax")).toBe(true);
    });

    test("null/undefined industry defaults to legal", () => {
      expect(isPathAllowedForIndustry("/dashboard/cases", null)).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/tax-returns", null)).toBe(false);
      expect(isPathAllowedForIndustry("/dashboard/cases", undefined)).toBe(true);
    });

    test("onboarding page is always allowed", () => {
      expect(isPathAllowedForIndustry("/dashboard/onboarding", "legal")).toBe(true);
      expect(isPathAllowedForIndustry("/dashboard/onboarding", "tax")).toBe(true);
    });
  });

  describe("isApiPathAllowedForIndustry", () => {
    test("legal user can access legal API routes", () => {
      expect(isApiPathAllowedForIndustry("/api/legal/cases", "legal")).toBe(true);
      expect(isApiPathAllowedForIndustry("/api/legal/analyze", "legal")).toBe(true);
    });

    test("tax user cannot access legal API routes", () => {
      expect(isApiPathAllowedForIndustry("/api/legal/cases", "tax")).toBe(false);
      expect(isApiPathAllowedForIndustry("/api/bea/send", "tax")).toBe(false);
    });

    test("tax user can access tax API routes", () => {
      expect(isApiPathAllowedForIndustry("/api/tax/returns", "tax")).toBe(true);
      expect(isApiPathAllowedForIndustry("/api/tax/assessments", "tax")).toBe(true);
      expect(isApiPathAllowedForIndustry("/api/tax/elster", "tax")).toBe(true);
    });

    test("legal user cannot access tax API routes", () => {
      expect(isApiPathAllowedForIndustry("/api/tax/returns", "legal")).toBe(false);
    });

    test("shared API routes are allowed for both", () => {
      expect(isApiPathAllowedForIndustry("/api/auth/me", "legal")).toBe(true);
      expect(isApiPathAllowedForIndustry("/api/auth/me", "tax")).toBe(true);
      expect(isApiPathAllowedForIndustry("/api/stats", "legal")).toBe(true);
      expect(isApiPathAllowedForIndustry("/api/stats", "tax")).toBe(true);
    });
  });

  describe("redirectForIndustry", () => {
    test("returns /dashboard when tax user hits legal page", () => {
      expect(redirectForIndustry("/dashboard/cases", "tax")).toBe("/dashboard");
      expect(redirectForIndustry("/dashboard/drafting", "tax")).toBe("/dashboard");
    });

    test("returns /dashboard when legal user hits tax page", () => {
      expect(redirectForIndustry("/dashboard/tax-returns", "legal")).toBe("/dashboard");
      expect(redirectForIndustry("/dashboard/elster", "legal")).toBe("/dashboard");
    });

    test("returns null for allowed pages", () => {
      expect(redirectForIndustry("/dashboard", "legal")).toBe(null);
      expect(redirectForIndustry("/dashboard", "tax")).toBe(null);
      expect(redirectForIndustry("/dashboard/contacts", "tax")).toBe(null);
    });
  });

  describe("page lists are non-empty and non-overlapping", () => {
    test("LEGAL_ONLY_PAGES and TAX_ONLY_PAGES have no overlap", () => {
      const legalSet = new Set(LEGAL_ONLY_PAGES);
      for (const taxPage of TAX_ONLY_PAGES) {
        expect(legalSet.has(taxPage)).toBe(false);
      }
    });

    test("both lists are non-empty", () => {
      expect(LEGAL_ONLY_PAGES.length).toBeGreaterThan(0);
      expect(TAX_ONLY_PAGES.length).toBeGreaterThan(0);
    });
  });
});
