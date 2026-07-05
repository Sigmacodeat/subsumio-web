import { describe, test, expect } from "vitest";
import { createCreditCheck, interpretCreditScore, GDPR_NOTICE_DE } from "./credit-check";

describe("credit-check", () => {
  describe("interpretCreditScore", () => {
    test("returns low risk for high scores", () => {
      const result = interpretCreditScore(90);
      expect(result.risk_level).toBe("low");
    });

    test("returns medium risk for mid scores", () => {
      const result = interpretCreditScore(60);
      expect(result.risk_level).toBe("medium");
    });

    test("returns high risk for low scores", () => {
      const result = interpretCreditScore(30);
      expect(result.risk_level).toBe("high");
    });
  });

  describe("createCreditCheck", () => {
    test("creates check with correct fields", () => {
      const check = createCreditCheck({
        client_name: "Max Mustermann",
        case_slug: "case-123",
        provider: "creditreform",
        gdpr_consent: true,
      });
      expect(check.id).toMatch(/^credit-/);
      expect(check.client_name).toBe("Max Mustermann");
      expect(check.case_slug).toBe("case-123");
      expect(check.status).toBe("pending");
    });

    test("creates check with opted_out provider", () => {
      const check = createCreditCheck({
        client_name: "Test Client",
        provider: "opted_out",
        gdpr_consent: false,
      });
      expect(check.provider).toBe("opted_out");
      expect(check.status).toBe("opted_out");
    });
  });

  test("GDPR notice is non-empty", () => {
    expect(GDPR_NOTICE_DE.length).toBeGreaterThan(20);
  });
});
