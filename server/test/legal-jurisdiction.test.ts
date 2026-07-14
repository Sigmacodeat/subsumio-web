import { describe, expect, test } from "bun:test";
import {
  assertLegalSourceJurisdiction,
  statuteJurisdictionFromSlug,
} from "../src/core/legal/jurisdiction.ts";
import {
  foreignStatutePrefixes,
  LEGAL_CONTENT_CLASSES,
  STATUTE_JURISDICTIONS,
} from "../src/core/search/source-boost.ts";

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

describe("foreignStatutePrefixes covers every legal content class", () => {
  test("jurisdiction=de excludes AT judikatur, landesrecht, and staatsvertraege — not just statutes", () => {
    const excluded = foreignStatutePrefixes("de");
    expect(excluded).toContain("legal/statutes/at/");
    expect(excluded).toContain("legal/judikatur/at/");
    expect(excluded).toContain("legal/landesrecht/at/");
    expect(excluded).toContain("legal/staatsvertraege/at/");
  });

  test("own-jurisdiction prefixes are never excluded", () => {
    for (const jur of STATUTE_JURISDICTIONS) {
      const excluded = foreignStatutePrefixes(jur);
      for (const cls of LEGAL_CONTENT_CLASSES) {
        expect(excluded).not.toContain(`legal/${cls}/${jur}/`);
      }
    }
  });

  test("every foreign jurisdiction × every content class is excluded (full matrix)", () => {
    for (const jur of STATUTE_JURISDICTIONS) {
      const excluded = new Set(foreignStatutePrefixes(jur));
      const foreign = STATUTE_JURISDICTIONS.filter((j) => j !== jur);
      expect(excluded.size).toBe(foreign.length * LEGAL_CONTENT_CLASSES.length);
      for (const f of foreign) {
        for (const cls of LEGAL_CONTENT_CLASSES) {
          expect(excluded.has(`legal/${cls}/${f}/`)).toBe(true);
        }
      }
    }
  });

  test("blank or unknown jurisdiction excludes nothing", () => {
    expect(foreignStatutePrefixes(undefined)).toEqual([]);
    expect(foreignStatutePrefixes("")).toEqual([]);
    expect(foreignStatutePrefixes("us")).toEqual([]);
  });
});
