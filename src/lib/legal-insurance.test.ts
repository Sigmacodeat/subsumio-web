import { describe, test, expect } from "vitest";
import { createRSVCaseData, buildCoverageInquiryEmail } from "./legal-insurance";

describe("legal-insurance", () => {
  describe("createRSVCaseData", () => {
    test("creates case data with correct fields", () => {
      const rsv = createRSVCaseData({
        case_slug: "case-123",
        client_name: "Max Mustermann",
        insurance_provider: "ARAG",
        insurance_number: "RSV-12345",
      });
      expect(rsv.id).toMatch(/^rsv-/);
      expect(rsv.case_slug).toBe("case-123");
      expect(rsv.client_name).toBe("Max Mustermann");
      expect(rsv.insurance_provider).toBe("ARAG");
      expect(rsv.coverage_status).toBe("not_inquired");
    });

    test("works without insurance number", () => {
      const rsv = createRSVCaseData({
        case_slug: "c1",
        client_name: "Test",
        insurance_provider: "R+V",
      });
      expect(rsv.insurance_number).toBeUndefined();
    });
  });

  describe("buildCoverageInquiryEmail", () => {
    test("builds email with subject and body", () => {
      const rsv = createRSVCaseData({
        case_slug: "case-123",
        client_name: "Max Mustermann",
        insurance_provider: "ARAG",
      });
      const email = buildCoverageInquiryEmail(rsv, "Scheidung", "Familienrecht", 5000);
      expect(email.subject).toContain("Deckungsanfrage");
      expect(email.subject).toContain("Max Mustermann");
      expect(email.body).toContain("Max Mustermann");
      expect(email.body).toContain("Familienrecht");
      expect(email.body).toContain("Scheidung");
      expect(email.body).toContain("5000.00 EUR");
    });

    test("works without dispute value", () => {
      const rsv = createRSVCaseData({
        case_slug: "c1",
        client_name: "Test",
        insurance_provider: "Allianz",
      });
      const email = buildCoverageInquiryEmail(rsv, "Miete", "Mietrecht");
      expect(email.body).not.toContain("Streitwert");
    });
  });
});
