import { describe, expect, test } from "bun:test";
import {
  assertLegalSourceJurisdiction,
  statuteJurisdictionFromSlug,
} from "../src/core/legal/jurisdiction.ts";

describe("legal source jurisdiction contract", () => {
  test("maps statute and judikatur slugs to their jurisdiction", () => {
    expect(statuteJurisdictionFromSlug("legal/statutes/at/abgb/p-1295")).toBe("at");
    expect(statuteJurisdictionFromSlug("legal/judikatur/at/ogh/foo")).toBe("at");
    expect(statuteJurisdictionFromSlug("legal/statutes/de/bgb/p-195")).toBe("de");
    expect(statuteJurisdictionFromSlug("notes/example")).toBeNull();
  });

  test("accepts only the canonical source for a jurisdiction", () => {
    expect(() =>
      assertLegalSourceJurisdiction("at", "law-at", "legal/statutes/at/abgb/p-1295")
    ).not.toThrow();
  });

  test("rejects importing AT material into a DE source", () => {
    expect(() =>
      assertLegalSourceJurisdiction("at", "law-de", "legal/statutes/at/abgb/p-1295")
    ).toThrow(/must use law-at/);
  });

  test("rejects a mismatching legal slug", () => {
    expect(() =>
      assertLegalSourceJurisdiction("at", "law-at", "legal/statutes/de/bgb/p-195")
    ).toThrow(/does not match/);
  });
});
