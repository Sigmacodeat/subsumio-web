import { describe, test, expect } from "vitest";
import {
  createPowerOfAttorney,
  isPoAValid,
  getExpiringPoAs,
  POA_TYPE_LABELS,
  POA_STATUS_LABELS,
} from "./power-of-attorney";

describe("power-of-attorney", () => {
  describe("createPowerOfAttorney", () => {
    test("creates PoA with correct fields", () => {
      const poa = createPowerOfAttorney({
        case_slug: "case-123",
        client_name: "Max Mustermann",
        type: "litigation",
        scope: "Vertretung im Verfahren XY",
      });
      expect(poa.id).toMatch(/^poa-/);
      expect(poa.case_slug).toBe("case-123");
      expect(poa.client_name).toBe("Max Mustermann");
      expect(poa.type).toBe("litigation");
      expect(poa.status).toBe("draft");
    });

    test("accepts optional expiry date", () => {
      const poa = createPowerOfAttorney({
        case_slug: "case-123",
        client_name: "Test",
        type: "general",
        scope: "Allgemein",
        expires_at: "2026-12-31",
      });
      expect(poa.expires_at).toBe("2026-12-31");
    });
  });

  describe("isPoAValid", () => {
    test("returns true for signed PoA without expiry", () => {
      const poa = createPowerOfAttorney({
        case_slug: "c1",
        client_name: "Test",
        type: "general",
        scope: "Test",
      });
      expect(isPoAValid({ ...poa, status: "signed" })).toBe(true);
    });

    test("returns false for revoked PoA", () => {
      const poa = createPowerOfAttorney({
        case_slug: "c1",
        client_name: "Test",
        type: "general",
        scope: "Test",
      });
      expect(isPoAValid({ ...poa, status: "revoked" })).toBe(false);
    });

    test("returns false for expired PoA", () => {
      const poa = createPowerOfAttorney({
        case_slug: "c1",
        client_name: "Test",
        type: "general",
        scope: "Test",
        expires_at: "2020-01-01",
      });
      expect(isPoAValid({ ...poa, status: "signed" })).toBe(false);
    });
  });

  describe("getExpiringPoAs", () => {
    test("returns PoAs expiring within given days", () => {
      const soon = new Date(Date.now() + 10 * 86400000).toISOString();
      const far = new Date(Date.now() + 100 * 86400000).toISOString();
      const poas = [
        {
          ...createPowerOfAttorney({
            case_slug: "c1",
            client_name: "A",
            type: "general",
            scope: "x",
          }),
          status: "signed" as const,
          expires_at: soon,
        },
        {
          ...createPowerOfAttorney({
            case_slug: "c2",
            client_name: "B",
            type: "general",
            scope: "x",
          }),
          status: "signed" as const,
          expires_at: far,
        },
      ];
      const expiring = getExpiringPoAs(poas, 30);
      expect(expiring).toHaveLength(1);
      expect(expiring[0]!.client_name).toBe("A");
    });
  });

  test("labels are defined for all types and statuses", () => {
    expect(Object.keys(POA_TYPE_LABELS).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(POA_STATUS_LABELS).length).toBeGreaterThanOrEqual(4);
  });
});
