import { describe, test, expect } from "vitest";
import { createEducationEntry, computeAnnualStatus, FAO_REQUIRED_HOURS } from "./fao-tracking";

describe("fao-tracking", () => {
  describe("createEducationEntry", () => {
    test("creates entry with correct fields", () => {
      const entry = createEducationEntry({
        lawyer_email: "ra@test.de",
        lawyer_name: "RA Test",
        specialist_title: "Fachanwalt für Familienrecht",
        date: "2026-06-01",
        hours: 5,
        topic: "Neues Familienrecht",
        provider: "DAV",
      });
      expect(entry.id).toMatch(/^edu-/);
      expect(entry.lawyer_email).toBe("ra@test.de");
      expect(entry.hours).toBe(5);
      expect(entry.status).toBe("pending");
    });
  });

  describe("computeAnnualStatus", () => {
    test("computes status for compliant year", () => {
      const entries = [
        {
          ...createEducationEntry({
            lawyer_email: "ra@test.de",
            lawyer_name: "RA Test",
            specialist_title: "FA",
            date: "2026-01-01",
            hours: 10,
            topic: "A",
            provider: "DAV",
          }),
          status: "verified" as const,
        },
        {
          ...createEducationEntry({
            lawyer_email: "ra@test.de",
            lawyer_name: "RA Test",
            specialist_title: "FA",
            date: "2026-06-01",
            hours: 8,
            topic: "B",
            provider: "DAV",
          }),
          status: "verified" as const,
        },
      ];
      const status = computeAnnualStatus("ra@test.de", "RA Test", "FA", entries, 2026);
      expect(status.completed_hours).toBe(18);
      expect(status.status).toBe("fulfilled");
    });

    test("computes status for non-compliant year", () => {
      const entries = [
        {
          ...createEducationEntry({
            lawyer_email: "ra@test.de",
            lawyer_name: "RA Test",
            specialist_title: "FA",
            date: "2026-01-01",
            hours: 5,
            topic: "A",
            provider: "DAV",
          }),
          status: "verified" as const,
        },
      ];
      const status = computeAnnualStatus("ra@test.de", "RA Test", "FA", entries, 2026);
      expect(status.completed_hours).toBe(5);
      expect(status.status).not.toBe("fulfilled");
    });

    test("only counts verified entries", () => {
      const entries = [
        {
          ...createEducationEntry({
            lawyer_email: "ra@test.de",
            lawyer_name: "RA Test",
            specialist_title: "FA",
            date: "2026-01-01",
            hours: 20,
            topic: "A",
            provider: "DAV",
          }),
          status: "pending" as const,
        },
      ];
      const status = computeAnnualStatus("ra@test.de", "RA Test", "FA", entries, 2026);
      expect(status.completed_hours).toBe(0);
    });
  });

  test("FAO_REQUIRED_HOURS is a positive number", () => {
    expect(FAO_REQUIRED_HOURS).toBeGreaterThan(0);
  });
});
