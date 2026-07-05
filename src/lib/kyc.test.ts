import { describe, test, expect } from "vitest";
import { createKYCVerification, assessRiskLevel, getExpiringKYC } from "./kyc";

describe("kyc", () => {
  describe("assessRiskLevel", () => {
    test("returns low risk for no factors", () => {
      const result = assessRiskLevel({
        is_pep: false,
        is_high_risk_country: false,
        cash_intensive: false,
        complex_ownership: false,
        trust_or_company_structure: false,
      });
      expect(result.level).toBe("low");
      expect(result.factors).toHaveLength(0);
    });

    test("returns medium risk for one factor", () => {
      const result = assessRiskLevel({
        is_pep: true,
        is_high_risk_country: false,
        cash_intensive: false,
        complex_ownership: false,
        trust_or_company_structure: false,
      });
      expect(result.level).toBe("medium");
      expect(result.factors).toContain("PEP (politisch exponierte Person)");
    });

    test("returns high risk for three or more factors", () => {
      const result = assessRiskLevel({
        is_pep: true,
        is_high_risk_country: true,
        cash_intensive: true,
        complex_ownership: false,
        trust_or_company_structure: false,
      });
      expect(result.level).toBe("high");
      expect(result.factors).toHaveLength(3);
    });
  });

  describe("createKYCVerification", () => {
    test("creates verification with correct defaults", () => {
      const v = createKYCVerification({
        case_slug: "case-123",
        client_name: "Test GmbH",
      });
      expect(v.id).toMatch(/^kyc-/);
      expect(v.case_slug).toBe("case-123");
      expect(v.status).toBe("pending");
      expect(v.provider).toBe("manual");
      expect(v.risk_level).toBe("low");
      expect(v.transparenzregister_checked).toBe(false);
    });

    test("accepts custom provider and risk level", () => {
      const v = createKYCVerification({
        case_slug: "c1",
        client_name: "Test",
        provider: "idnow",
        risk_level: "high",
        risk_factors: ["PEP"],
      });
      expect(v.provider).toBe("idnow");
      expect(v.risk_level).toBe("high");
      expect(v.risk_factors).toContain("PEP");
    });
  });

  describe("getExpiringKYC", () => {
    test("returns verifications expiring within given days", () => {
      const soon = new Date(Date.now() + 10 * 86400000).toISOString();
      const far = new Date(Date.now() + 100 * 86400000).toISOString();
      const verifications = [
        {
          ...createKYCVerification({ case_slug: "c1", client_name: "A" }),
          status: "verified" as const,
          expires_at: soon,
        },
        {
          ...createKYCVerification({ case_slug: "c2", client_name: "B" }),
          status: "verified" as const,
          expires_at: far,
        },
      ];
      const expiring = getExpiringKYC(verifications, 30);
      expect(expiring).toHaveLength(1);
      expect(expiring[0]!.client_name).toBe("A");
    });

    test("does not return already expired or non-verified", () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      const verifications = [
        {
          ...createKYCVerification({ case_slug: "c1", client_name: "A" }),
          status: "verified" as const,
          expires_at: past,
        },
        {
          ...createKYCVerification({ case_slug: "c2", client_name: "B" }),
          status: "pending" as const,
          expires_at: past,
        },
      ];
      const expiring = getExpiringKYC(verifications, 30);
      expect(expiring).toHaveLength(0);
    });
  });
});
