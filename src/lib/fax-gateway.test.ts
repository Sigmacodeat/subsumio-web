import { describe, test, expect } from "vitest";
import { createFaxTransmission, validateFaxNumber, formatFaxNumber } from "./fax-gateway";

describe("fax-gateway", () => {
  describe("validateFaxNumber", () => {
    test("accepts valid international format", () => {
      expect(validateFaxNumber("+49 30 1234567")).toBe(true);
      expect(validateFaxNumber("+49301234567")).toBe(true);
      expect(validateFaxNumber("+1 212 555 1234")).toBe(true);
    });

    test("accepts valid German national format with +49", () => {
      expect(validateFaxNumber("+49 30 1234567")).toBe(true);
      expect(validateFaxNumber("+49301234567")).toBe(true);
    });

    test("rejects empty string", () => {
      expect(validateFaxNumber("")).toBe(false);
    });

    test("rejects strings with letters", () => {
      expect(validateFaxNumber("+49 30 ABC123")).toBe(false);
    });

    test("rejects strings that are too long", () => {
      expect(validateFaxNumber("+" + "1".repeat(60))).toBe(false);
    });
  });

  describe("formatFaxNumber", () => {
    test("strips spaces and dashes", () => {
      expect(formatFaxNumber("+49 30 1234-567")).toBe("+49301234567");
    });

    test("convertates leading 0 to +49", () => {
      const result = formatFaxNumber("0301234567");
      expect(result).toMatch(/^\+49/);
    });
  });

  describe("createFaxTransmission", () => {
    test("creates transmission with correct defaults", () => {
      const t = createFaxTransmission({
        direction: "outbound",
        to_number: "+49301234567",
        subject: "Test Fax",
      });
      expect(t.id).toMatch(/^fax-/);
      expect(t.direction).toBe("outbound");
      expect(t.to_number).toBe("+49301234567");
      expect(t.subject).toBe("Test Fax");
      expect(t.status).toBe("queued");
      expect(t.created_at).toBeTruthy();
    });

    test("accepts optional fields", () => {
      const t = createFaxTransmission({
        direction: "outbound",
        to_number: "+49301234567",
        subject: "Test",
        case_slug: "case-123",
        document_slug: "doc-456",
        provider: "sipgate",
      });
      expect(t.case_slug).toBe("case-123");
      expect(t.document_slug).toBe("doc-456");
      expect(t.provider).toBe("sipgate");
    });
  });
});
