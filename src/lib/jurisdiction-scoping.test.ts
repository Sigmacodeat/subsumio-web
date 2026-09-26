import { describe, test, expect } from "vitest";

// Unit test for the jurisdiction-scoped read scope of the engine
// (server/src/commands/web-api.ts readSourcesFor → scopedReadSources).
// Case > User > Fail-Closed — the product function, not a copy.
import { scopedReadSources } from "../../server/src/core/legal/jurisdiction";

function readSourcesForImpl(
  sharedSources: string[],
  ownSource: string,
  caseJurisdiction?: string,
  userJurisdiction?: string
): string[] | undefined {
  return scopedReadSources(sharedSources, ownSource, caseJurisdiction, userJurisdiction);
}

describe("readSourcesFor — jurisdiction-scoped law federation", () => {
  const ALL_SOURCES = ["law-de", "law-at", "law-ch", "law-eu"];

  test("DE attorney gets only law-de + law-eu (not law-at, law-ch)", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_abc", undefined, "DE");
    expect(result).toBeDefined();
    expect(result).toContain("brain_abc");
    expect(result).toContain("law-de");
    expect(result).toContain("law-eu");
    expect(result).not.toContain("law-at");
    expect(result).not.toContain("law-ch");
  });

  test("AT attorney gets only law-at + law-eu (not law-de, law-ch)", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_xyz", undefined, "AT");
    expect(result).toBeDefined();
    expect(result).toContain("brain_xyz");
    expect(result).toContain("law-at");
    expect(result).toContain("law-eu");
    expect(result).not.toContain("law-de");
    expect(result).not.toContain("law-ch");
  });

  test("CH attorney gets only law-ch + law-eu (not law-de, law-at)", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_ch1", undefined, "CH");
    expect(result).toBeDefined();
    expect(result).toContain("brain_ch1");
    expect(result).toContain("law-ch");
    expect(result).toContain("law-eu");
    expect(result).not.toContain("law-de");
    expect(result).not.toContain("law-at");
  });

  test("No jurisdiction header → fail-closed (own source only, no law corpus)", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_legacy", undefined, undefined);
    expect(result).toBeDefined();
    expect(result).toEqual(["brain_legacy"]);
    expect(result).not.toContain("law-de");
    expect(result).not.toContain("law-at");
    expect(result).not.toContain("law-ch");
    expect(result).not.toContain("law-eu");
  });

  test("Unknown jurisdiction → fail-closed (own source only)", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_unk", undefined, "XX");
    expect(result).toBeDefined();
    expect(result).toEqual(["brain_unk"]);
  });

  test("Case jurisdiction takes priority over user jurisdiction", () => {
    // User is DE, case is AT → gets AT law, not DE law
    const result = readSourcesForImpl(ALL_SOURCES, "brain_abc", "AT", "DE");
    expect(result).toBeDefined();
    expect(result).toContain("law-at");
    expect(result).toContain("law-eu");
    expect(result).not.toContain("law-de");
  });

  test("Case jurisdiction alone (no user jurisdiction) works", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_abc", "DE", undefined);
    expect(result).toBeDefined();
    expect(result).toContain("law-de");
    expect(result).not.toContain("law-at");
  });

  test("Empty shared sources → undefined (feature disabled)", () => {
    const result = readSourcesForImpl([], "brain_noshared", "DE");
    expect(result).toBeUndefined();
  });

  test("Lowercase jurisdiction header is accepted", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_lower", undefined, "de");
    expect(result).toBeDefined();
    expect(result).toContain("law-de");
    expect(result).not.toContain("law-at");
  });

  test("Lowercase case jurisdiction header is accepted", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_lower", "de");
    expect(result).toBeDefined();
    expect(result).toContain("law-de");
    expect(result).not.toContain("law-at");
  });

  test("EU law is always included for all DACH jurisdictions", () => {
    for (const jur of ["DE", "AT", "CH"] as const) {
      const result = readSourcesForImpl(ALL_SOURCES, "brain_eu", jur);
      expect(result).toContain("law-eu");
    }
  });

  test("Tenant's own source is always included even if not in shared list", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "brain_custom", undefined, "DE");
    expect(result).toContain("brain_custom");
  });

  test("No duplicate sources when own source matches a shared source", () => {
    const result = readSourcesForImpl(ALL_SOURCES, "law-de", undefined, "DE");
    expect(result).toBeDefined();
    const unique = new Set(result);
    expect(unique.size).toBe(result!.length);
  });
});
