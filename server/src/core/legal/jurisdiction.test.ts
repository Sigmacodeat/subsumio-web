import { describe, test, expect } from "bun:test";
import {
  LEGAL_SOURCE_BY_JURISDICTION,
  AT_LAW_SOURCES_ALL,
  AT_LAW_SOURCES_STATUTES,
  AT_LAW_SOURCES_JUDIKATUR,
  AT_PRIMARY_STATUTE_SOURCE,
  isLegalJurisdiction,
  statuteJurisdictionFromSlug,
  assertLegalSourceJurisdiction,
} from "./jurisdiction.ts";

describe("jurisdiction constants", () => {
  test("AT_LAW_SOURCES_ALL includes law-at-normen (the primary statute source with 147K pages)", () => {
    expect(AT_LAW_SOURCES_ALL).toContain("law-at-normen");
  });

  test("AT_LAW_SOURCES_ALL includes law-at-judikatur-ogh (the OGH judikatur source)", () => {
    expect(AT_LAW_SOURCES_ALL).toContain("law-at-judikatur-ogh");
  });

  test("AT_LAW_SOURCES_ALL includes law-eu (EU law for DACH)", () => {
    expect(AT_LAW_SOURCES_ALL).toContain("law-eu");
  });

  test("AT_LAW_SOURCES_STATUTES does not include judikatur sources", () => {
    expect(AT_LAW_SOURCES_STATUTES).not.toContain("law-at-judikatur");
    expect(AT_LAW_SOURCES_STATUTES).not.toContain("law-at-judikatur-ogh");
  });

  test("AT_LAW_SOURCES_JUDIKATUR does not include statute sources", () => {
    expect(AT_LAW_SOURCES_JUDIKATUR).not.toContain("law-at-normen");
    expect(AT_LAW_SOURCES_JUDIKATUR).not.toContain("law-at-landesrecht");
  });

  test("AT_LAW_SOURCES_ALL = statutes + judikatur + eu", () => {
    expect(AT_LAW_SOURCES_ALL).toEqual([
      ...AT_LAW_SOURCES_STATUTES,
      ...AT_LAW_SOURCES_JUDIKATUR,
      "law-eu",
    ]);
  });

  test("AT_PRIMARY_STATUTE_SOURCE is law-at-normen (not the empty law-at)", () => {
    expect(AT_PRIMARY_STATUTE_SOURCE).toBe("law-at-normen");
    expect(AT_PRIMARY_STATUTE_SOURCE).not.toBe("law-at");
  });

  test("all AT source IDs are unique", () => {
    const all = [...AT_LAW_SOURCES_ALL];
    expect(new Set(all).size).toBe(all.length);
  });

  test("AT_LAW_SOURCES_ALL has 25+ sources (statutes + judikatur + eu)", () => {
    expect(AT_LAW_SOURCES_ALL.length).toBeGreaterThanOrEqual(25);
  });
});

describe("isLegalJurisdiction", () => {
  test("accepts valid jurisdictions", () => {
    expect(isLegalJurisdiction("at")).toBe(true);
    expect(isLegalJurisdiction("de")).toBe(true);
    expect(isLegalJurisdiction("ch")).toBe(true);
    expect(isLegalJurisdiction("eu")).toBe(true);
  });

  test("rejects invalid jurisdictions", () => {
    expect(isLegalJurisdiction("fr")).toBe(false);
    expect(isLegalJurisdiction("us")).toBe(false);
    expect(isLegalJurisdiction("")).toBe(false);
  });

  test("is case-insensitive", () => {
    expect(isLegalJurisdiction("AT")).toBe(true);
    expect(isLegalJurisdiction("DE")).toBe(true);
  });
});

describe("statuteJurisdictionFromSlug", () => {
  test("extracts jurisdiction from statute slug", () => {
    expect(statuteJurisdictionFromSlug("legal/statutes/at/abgb/p-1295")).toBe("at");
    expect(statuteJurisdictionFromSlug("legal/statutes/de/bgb/s-823")).toBe("de");
    expect(statuteJurisdictionFromSlug("legal/statutes/ch/or/art-41")).toBe("ch");
  });

  test("extracts jurisdiction from judikatur slug", () => {
    expect(statuteJurisdictionFromSlug("legal/judikatur/at/ogh-2024-01")).toBe("at");
  });

  test("returns null for non-legal slugs", () => {
    expect(statuteJurisdictionFromSlug("akten/urteil.pdf")).toBeNull();
    expect(statuteJurisdictionFromSlug("mail/inbox")).toBeNull();
  });
});

describe("assertLegalSourceJurisdiction", () => {
  test("passes when source matches jurisdiction", () => {
    expect(() => assertLegalSourceJurisdiction("at", "law-at")).not.toThrow();
    expect(() => assertLegalSourceJurisdiction("de", "law-de")).not.toThrow();
  });

  test("throws when source does not match jurisdiction", () => {
    expect(() => assertLegalSourceJurisdiction("at", "law-de")).toThrow();
    expect(() => assertLegalSourceJurisdiction("de", "law-at")).toThrow();
  });
});
