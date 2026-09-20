import { describe, expect, test } from "bun:test";
import { QUERY_PROBES, probeHit, type QueryProbe } from "../src/core/embedding-probes.ts";

const verjaehrung: QueryProbe = QUERY_PROBES[0]!;

describe("probeHit", () => {
  test("matches on the chunk's own columns", () => {
    expect(
      probeHit(verjaehrung, { statute_abbr: "ABGB", paragraph_ref: "§ 1489" })
    ).toBe(true);
  });

  test("matches on the citation label when RIS has no abbreviation", () => {
    expect(
      probeHit(verjaehrung, {
        statute_abbr: null,
        paragraph_ref: null,
        canonical_label: "Allgemeines bürgerliches Gesetzbuch § 1489",
      })
    ).toBe(true);
  });

  test("§ 148 is not § 1489", () => {
    expect(probeHit(verjaehrung, { statute_abbr: "ABGB", paragraph_ref: "§ 148" })).toBe(false);
    expect(
      probeHit(verjaehrung, { canonical_label: "ABGB § 148", statute_abbr: null })
    ).toBe(false);
  });

  test("the right section of the wrong law does not count", () => {
    expect(probeHit(verjaehrung, { statute_abbr: "StGB", paragraph_ref: "§ 1489" })).toBe(false);
  });

  test("an abbreviation inside a longer word does not count", () => {
    const probe: QueryProbe = { question: "x", abbr: "UGB", paragraph: "§ 377" };
    expect(
      probeHit(probe, { canonical_label: "Landarbeitsordnung § 377", statute_abbr: null })
    ).toBe(false);
    expect(probeHit(probe, { statute_abbr: "UGB", paragraph_ref: "§ 377" })).toBe(true);
  });

  test("spacing around the section sign is irrelevant", () => {
    expect(probeHit(verjaehrung, { statute_abbr: "abgb", paragraph_ref: "§1489" })).toBe(true);
  });
});

describe("QUERY_PROBES", () => {
  test("every question names a law and a section", () => {
    for (const p of QUERY_PROBES) {
      expect(p.question.length).toBeGreaterThan(15);
      expect(p.abbr).toMatch(/^[A-Za-zÄÖÜäöüß-]+$/);
      expect(p.paragraph).toMatch(/^(§|Art\.)\s?\d+/);
    }
  });

  test("no question is asked twice", () => {
    const seen = new Set(QUERY_PROBES.map((p) => p.question));
    expect(seen.size).toBe(QUERY_PROBES.length);
  });
});
