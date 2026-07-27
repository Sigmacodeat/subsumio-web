import { describe, it, expect } from "vitest";
import type { SearchResult } from "../types.ts";
import {
  applyAuthorityLevelBoost,
  applyCitationAuthorityBoost,
  DEFAULT_AUTHORITY_LEVEL_BOOST,
} from "./hybrid.ts";

function makeResult(
  slug: string,
  score: number,
  overrides: Partial<SearchResult> = {}
): SearchResult {
  return {
    slug,
    title: slug,
    chunk_id: 0,
    page_id: 1,
    score,
    chunk_text: "",
    type: "court_decision",
    ...overrides,
  } as SearchResult;
}

describe("applyAuthorityLevelBoost", () => {
  it("boosts OGH decisions (Tier 1, ×1.08)", () => {
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.08, 10);
    expect(results[0].authority_level_boost).toBe(1.08);
  });

  it("boosts VfGH decisions (Tier 2, ×1.06)", () => {
    const results = [makeResult("legal/judikatur/at/vfgh/2024-01-15-b-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.06, 10);
    expect(results[0].authority_level_boost).toBe(1.06);
  });

  it("boosts VwGH decisions (Tier 2, ×1.06)", () => {
    const results = [makeResult("legal/judikatur/at/vwgh/2024-01-15-ra-2024-01-15", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.06, 10);
  });

  it("boosts BVwG decisions (Tier 3, ×1.04)", () => {
    const results = [makeResult("legal/judikatur/at/bvwg/2024-01-15-w-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.04, 10);
  });

  it("boosts LVwG decisions (Tier 3, ×1.04)", () => {
    const results = [makeResult("legal/judikatur/at/lvwg/2024-01-15-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.04, 10);
  });

  it("boosts AsylGH decisions (Tier 3, ×1.04)", () => {
    const results = [makeResult("legal/judikatur/at/asylgh/2024-01-15-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.04, 10);
  });

  it("boosts UVS decisions (Tier 4, ×1.02)", () => {
    const results = [makeResult("legal/judikatur/at/uvs/2010-01-15-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.02, 10);
  });

  it("boosts BGH decisions (DE, Tier 2, ×1.06)", () => {
    const results = [makeResult("legal/judikatur/de/bgh/2024-01-15-vi-zr-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.06, 10);
  });

  it("boosts BVerfG decisions (DE, Tier 2, ×1.06)", () => {
    const results = [makeResult("legal/judikatur/de/bverfg/2024-01-15-1-bvr-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.06, 10);
  });

  it("boosts BGer decisions (CH, Tier 2, ×1.06)", () => {
    const results = [makeResult("legal/judikatur/ch/bger/2024-01-15-4a-123-24", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(1.06, 10);
  });

  it("does not boost non-judikatur pages", () => {
    const results = [makeResult("legal/statutes/at/abgb/p-1", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBe(1.0);
    expect(results[0].authority_level_boost).toBeUndefined();
  });

  it("does not boost unknown courts", () => {
    const results = [makeResult("legal/judikatur/at/unknown-court/2024-01-15", 1.0)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBe(1.0);
    expect(results[0].authority_level_boost).toBeUndefined();
  });

  it("respects floor threshold", () => {
    const results = [
      makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 0.5),
      makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-456-24", 1.5),
    ];
    applyAuthorityLevelBoost(results, 1.0);
    expect(results[0].score).toBe(0.5); // below floor, not boosted
    expect(results[0].authority_level_boost).toBeUndefined();
    expect(results[1].score).toBeCloseTo(1.62, 10); // 1.5 * 1.08
    expect(results[1].authority_level_boost).toBe(1.08);
  });

  it("handles empty results", () => {
    const results: SearchResult[] = [];
    applyAuthorityLevelBoost(results);
    expect(results.length).toBe(0);
  });

  it("skips NaN scores", () => {
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15", NaN)];
    applyAuthorityLevelBoost(results);
    expect(isNaN(results[0].score)).toBe(true);
    expect(results[0].authority_level_boost).toBeUndefined();
  });

  it("higher court gets bigger boost than lower court", () => {
    const ogh = makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0);
    const bvwg = makeResult("legal/judikatur/at/bvwg/2024-01-15-w-123-24", 1.0);
    applyAuthorityLevelBoost([ogh, bvwg]);
    expect(ogh.score).toBeGreaterThan(bvwg.score);
  });

  it("boost stacks with existing score", () => {
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 2.5)];
    applyAuthorityLevelBoost(results);
    expect(results[0].score).toBeCloseTo(2.7, 10); // 2.5 * 1.08
  });
});

describe("applyCitationAuthorityBoost", () => {
  it("boosts decisions with >5 citations (×1.03)", () => {
    const counts = new Map<string, number>([["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 6]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBeCloseTo(1.03, 10);
    expect(results[0].citation_authority_boost).toBe(1.03);
  });

  it("boosts decisions with >20 citations (×1.05)", () => {
    const counts = new Map<string, number>([["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 21]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBeCloseTo(1.05, 10);
    expect(results[0].citation_authority_boost).toBe(1.05);
  });

  it("boosts decisions with >50 citations (×1.08)", () => {
    const counts = new Map<string, number>([["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 51]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBeCloseTo(1.08, 10);
    expect(results[0].citation_authority_boost).toBe(1.08);
  });

  it("boosts decisions with >100 citations (×1.10)", () => {
    const counts = new Map<string, number>([
      ["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 101],
    ]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBeCloseTo(1.1, 10);
    expect(results[0].citation_authority_boost).toBe(1.1);
  });

  it("does not boost decisions with <5 citations", () => {
    const counts = new Map<string, number>([["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 4]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBe(1.0);
    expect(results[0].citation_authority_boost).toBeUndefined();
  });

  it("does not boost decisions with 0 citations", () => {
    const counts = new Map<string, number>();
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBe(1.0);
  });

  it("does not boost non-judikatur pages even with high citations", () => {
    const counts = new Map<string, number>([["legal/statutes/at/abgb/p-1", 200]]);
    const results = [makeResult("legal/statutes/at/abgb/p-1", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBe(1.0);
    expect(results[0].citation_authority_boost).toBeUndefined();
  });

  it("respects floor threshold", () => {
    const counts = new Map<string, number>([["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 50]]);
    const results = [
      makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 0.5),
      makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-456-24", 1.5),
    ];
    const counts2 = new Map<string, number>([
      ["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 50],
      ["legal/judikatur/at/ogh/2024-01-15-1-ob-456-24", 50],
    ]);
    applyCitationAuthorityBoost(results, counts2, 1.0);
    expect(results[0].score).toBe(0.5); // below floor
    expect(results[0].citation_authority_boost).toBeUndefined();
    expect(results[1].score).toBeCloseTo(1.62, 10); // 1.5 * 1.08
  });

  it("handles empty results", () => {
    const counts = new Map<string, number>();
    const results: SearchResult[] = [];
    applyCitationAuthorityBoost(results, counts);
    expect(results.length).toBe(0);
  });

  it("skips NaN scores", () => {
    const counts = new Map<string, number>([["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 50]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", NaN)];
    applyCitationAuthorityBoost(results, counts);
    expect(isNaN(results[0].score)).toBe(true);
    expect(results[0].citation_authority_boost).toBeUndefined();
  });

  it("landmark precedent ranks higher than routine ruling", () => {
    const counts = new Map<string, number>([
      ["legal/judikatur/at/ogh/2024-01-15-landmark", 100],
      ["legal/judikatur/at/ogh/2024-01-15-routine", 2],
    ]);
    const results = [
      makeResult("legal/judikatur/at/ogh/2024-01-15-landmark", 1.0),
      makeResult("legal/judikatur/at/ogh/2024-01-15-routine", 1.0),
    ];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("exact threshold boundary: 5 citations gets ×1.03", () => {
    const counts = new Map<string, number>([["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 5]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBeCloseTo(1.03, 10);
  });

  it("exact threshold boundary: 100 citations gets ×1.10", () => {
    const counts = new Map<string, number>([
      ["legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 100],
    ]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0)];
    applyCitationAuthorityBoost(results, counts);
    expect(results[0].score).toBeCloseTo(1.1, 10);
  });
});

describe("authority + citation stacking", () => {
  it("authority-level and citation authority boosts stack multiplicatively", () => {
    const counts = new Map<string, number>([["legal/judikatur/at/ogh/2024-01-15-landmark", 50]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-landmark", 1.0)];
    applyAuthorityLevelBoost(results);
    applyCitationAuthorityBoost(results, counts);
    // OGH: ×1.08 (authority) × 1.08 (citation >50) = ×1.1664
    expect(results[0].score).toBeCloseTo(1.1664, 6);
    expect(results[0].authority_level_boost).toBe(1.08);
    expect(results[0].citation_authority_boost).toBe(1.08);
  });
});
