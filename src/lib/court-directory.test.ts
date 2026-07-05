import { describe, test, expect } from "vitest";
import {
  searchCourts,
  findCourtBySafeId,
  determineJurisdiction,
  GERMAN_COURTS,
  AUSTRIAN_COURTS,
} from "./court-directory";

describe("court-directory", () => {
  describe("searchCourts", () => {
    test("returns courts matching name", () => {
      const results = searchCourts({ name: "Berlin" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name.includes("Berlin"))).toBe(true);
    });

    test("returns empty for non-matching query", () => {
      const results = searchCourts({ name: "NonExistentCourt12345" });
      expect(results).toHaveLength(0);
    });
  });

  describe("findCourtBySafeId", () => {
    test("finds court by SAFE-ID if exists", () => {
      const allCourts = [...GERMAN_COURTS, ...AUSTRIAN_COURTS];
      const courtWithSafeId = allCourts.find((c) => c.safe_id);
      if (courtWithSafeId) {
        const found = findCourtBySafeId(courtWithSafeId.safe_id!);
        expect(found).toBeDefined();
        expect(found!.safe_id).toBe(courtWithSafeId.safe_id);
      }
    });

    test("returns undefined for non-existent SAFE-ID", () => {
      expect(findCourtBySafeId("NON-EXISTENT")).toBeUndefined();
    });
  });

  describe("determineJurisdiction", () => {
    test("returns result for valid input", () => {
      const result = determineJurisdiction({
        matter: "Klage",
        disputeValue: 5000,
        plaintiffZip: "10115",
      });
      expect(result).toBeDefined();
      if (result) {
        expect(result.court).toBeTruthy();
      }
    });
  });

  test("GERMAN_COURTS is non-empty", () => {
    expect(GERMAN_COURTS.length).toBeGreaterThan(0);
  });

  test("AUSTRIAN_COURTS is non-empty", () => {
    expect(AUSTRIAN_COURTS.length).toBeGreaterThan(0);
  });
});
