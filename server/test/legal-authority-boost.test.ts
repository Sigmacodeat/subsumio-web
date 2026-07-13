import { describe, it, expect } from "bun:test";
import {
  applyLegalAuthorityBoost,
  DEFAULT_LEGAL_PARA_BOOST,
  DEFAULT_STATUTE_AREA_BOOST,
} from "../src/core/search/hybrid.ts";
import type { SearchResult } from "../src/core/types.ts";

function makeResult(
  slug: string,
  score: number,
  overrides: Partial<SearchResult> = {}
): SearchResult {
  return {
    slug,
    page_id: 1,
    title: "Test",
    type: "law" as any,
    chunk_text: "test",
    chunk_source: "compiled_truth",
    chunk_id: 1,
    chunk_index: 0,
    score,
    stale: false,
    ...overrides,
  };
}

describe("applyLegalAuthorityBoost", () => {
  it("demotes archived statute versions", () => {
    const results = [
      makeResult("legal/statutes/de/bgb/p-138", 1.0),
      makeResult("legal/statutes/de/bgb/p-138--v-2020-01-01", 1.0),
    ];
    applyLegalAuthorityBoost(results, "de");
    expect(results[0].score).toBe(1.05);
    expect(results[1].score).toBe(0.85);
    expect(results[1].legal_authority_boost).toBe(0.85);
  });

  it("boosts jurisdiction-matched statute pages", () => {
    const results = [
      makeResult("legal/statutes/de/bgb/p-138", 1.0),
      makeResult("notes/meeting-notes", 1.0),
    ];
    applyLegalAuthorityBoost(results, "de");
    expect(results[0].score).toBe(1.05);
    expect(results[0].legal_authority_boost).toBe(1.05);
    expect(results[1].score).toBe(1.0);
    expect(results[1].legal_authority_boost).toBeUndefined();
  });

  it("does not boost non-statute pages even with jurisdiction", () => {
    const results = [
      makeResult("notes/legal-note", 1.0),
      makeResult("documents/contract.pdf", 1.0),
    ];
    applyLegalAuthorityBoost(results, "de");
    expect(results[0].score).toBe(1.0);
    expect(results[1].score).toBe(1.0);
  });

  it("respects floor threshold", () => {
    const results = [
      makeResult("legal/statutes/de/bgb/p-138", 1.0),
      makeResult("legal/statutes/de/bgb/p-100", 0.3),
    ];
    applyLegalAuthorityBoost(results, "de", 0.5);
    expect(results[0].score).toBe(1.05);
    expect(results[1].score).toBe(0.3);
  });

  it("handles undefined jurisdiction (archived demotion only)", () => {
    const results = [
      makeResult("legal/statutes/de/bgb/p-138", 1.0),
      makeResult("legal/statutes/de/bgb/p-138--v-2019-06-01", 1.0),
    ];
    applyLegalAuthorityBoost(results, undefined);
    expect(results[0].score).toBe(1.0);
    expect(results[1].score).toBe(0.85);
  });

  it("does not boost foreign jurisdiction statutes", () => {
    const results = [
      makeResult("legal/statutes/at/abgb/p-1", 1.0),
    ];
    applyLegalAuthorityBoost(results, "de");
    expect(results[0].score).toBe(1.0);
    expect(results[0].legal_authority_boost).toBeUndefined();
  });

  it("skips non-finite scores", () => {
    const results = [
      makeResult("legal/statutes/de/bgb/p-138", NaN),
    ];
    applyLegalAuthorityBoost(results, "de");
    expect(results[0].score).toBeNaN();
  });
});
