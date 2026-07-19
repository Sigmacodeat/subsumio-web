import { describe, it, expect } from "vitest";
import type { SearchResult } from "../types.ts";
import { applyCitationValidityBoost } from "./hybrid.ts";

function makeResult(
  slug: string,
  score: number,
  pageId: number = 1,
  overrides: Partial<SearchResult> = {}
): SearchResult {
  return {
    slug,
    title: slug,
    chunk_id: 0,
    page_id: pageId,
    score,
    chunk_text: "",
    type: "court_decision",
    ...overrides,
  } as SearchResult;
}

describe("applyCitationValidityBoost", () => {
  it("demotes overturned decisions (×0.85)", () => {
    const statusMap = new Map<number, "overturned">([[1, "overturned"]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0, 1)];
    applyCitationValidityBoost(results, statusMap);
    expect(results[0].score).toBeCloseTo(0.85, 10);
    expect(results[0].citation_status).toBe("overturned");
    expect(results[0].citation_validity_boost).toBe(0.85);
  });

  it("demotes superseded decisions (×0.92)", () => {
    const statusMap = new Map<number, "superseded">([[1, "superseded"]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0, 1)];
    applyCitationValidityBoost(results, statusMap);
    expect(results[0].score).toBeCloseTo(0.92, 10);
    expect(results[0].citation_status).toBe("superseded");
    expect(results[0].citation_validity_boost).toBe(0.92);
  });

  it("boosts confirmed decisions (×1.02)", () => {
    const statusMap = new Map<number, "confirmed">([[1, "confirmed"]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0, 1)];
    applyCitationValidityBoost(results, statusMap);
    expect(results[0].score).toBeCloseTo(1.02, 10);
    expect(results[0].citation_status).toBe("confirmed");
    expect(results[0].citation_validity_boost).toBe(1.02);
  });

  it("does not modify good_law decisions (×1.00)", () => {
    const statusMap = new Map<number, "good_law">([[1, "good_law"]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0, 1)];
    applyCitationValidityBoost(results, statusMap);
    expect(results[0].score).toBe(1.0);
    expect(results[0].citation_status).toBeUndefined();
    expect(results[0].citation_validity_boost).toBeUndefined();
  });

  it("does not modify unenriched decisions (no entry in statusMap)", () => {
    const statusMap = new Map<number, never>([]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 1.0, 1)];
    applyCitationValidityBoost(results, statusMap);
    expect(results[0].score).toBe(1.0);
    expect(results[0].citation_status).toBeUndefined();
    expect(results[0].citation_validity_boost).toBeUndefined();
  });

  it("does not modify non-judikatur pages even with status", () => {
    const statusMap = new Map<number, "overturned">([[1, "overturned"]]);
    const results = [makeResult("legal/statutes/at/abgb/p-1", 1.0, 1)];
    applyCitationValidityBoost(results, statusMap);
    expect(results[0].score).toBe(1.0);
    expect(results[0].citation_status).toBeUndefined();
  });

  it("respects floor threshold", () => {
    const statusMap = new Map<number, "overturned">([
      [1, "overturned"],
      [2, "overturned"],
    ]);
    const results = [
      makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-123-24", 0.5, 1),
      makeResult("legal/judikatur/at/ogh/2024-01-15-1-ob-456-24", 1.5, 2),
    ];
    applyCitationValidityBoost(results, statusMap, 1.0);
    expect(results[0].score).toBe(0.5); // below floor, not modified
    expect(results[0].citation_status).toBeUndefined();
    expect(results[1].score).toBeCloseTo(1.275, 10); // 1.5 * 0.85
    expect(results[1].citation_status).toBe("overturned");
  });

  it("handles empty results", () => {
    const statusMap = new Map<number, "overturned">([[1, "overturned"]]);
    const results: SearchResult[] = [];
    applyCitationValidityBoost(results, statusMap);
    expect(results.length).toBe(0);
  });

  it("skips NaN scores", () => {
    const statusMap = new Map<number, "overturned">([[1, "overturned"]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15", NaN, 1)];
    applyCitationValidityBoost(results, statusMap);
    expect(isNaN(results[0].score)).toBe(true);
    expect(results[0].citation_status).toBeUndefined();
  });

  it("overturned decision ranks lower than good_law", () => {
    const statusMap = new Map<number, "overturned">([[1, "overturned"]]);
    const results = [
      makeResult("legal/judikatur/at/ogh/2024-01-15-overturned", 1.0, 1),
      makeResult("legal/judikatur/at/ogh/2024-01-15-good", 1.0, 2),
    ];
    applyCitationValidityBoost(results, statusMap);
    expect(results[1].score).toBeGreaterThan(results[0].score);
  });

  it("confirmed decision ranks higher than good_law", () => {
    const statusMap = new Map<number, "confirmed">([[2, "confirmed"]]);
    const results = [
      makeResult("legal/judikatur/at/ogh/2024-01-15-normal", 1.0, 1),
      makeResult("legal/judikatur/at/ogh/2024-01-15-confirmed", 1.0, 2),
    ];
    applyCitationValidityBoost(results, statusMap);
    expect(results[1].score).toBeGreaterThan(results[0].score);
  });

  it("overturned ranks lower than superseded", () => {
    const statusMap = new Map<number, "overturned" | "superseded">([
      [1, "overturned"],
      [2, "superseded"],
    ]);
    const results = [
      makeResult("legal/judikatur/at/ogh/2024-01-15-overturned", 1.0, 1),
      makeResult("legal/judikatur/at/ogh/2024-01-15-superseded", 1.0, 2),
    ];
    applyCitationValidityBoost(results, statusMap);
    expect(results[1].score).toBeGreaterThan(results[0].score);
  });

  it("boost stacks with existing score", () => {
    const statusMap = new Map<number, "overturned">([[1, "overturned"]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15", 2.0, 1)];
    applyCitationValidityBoost(results, statusMap);
    expect(results[0].score).toBeCloseTo(1.7, 10); // 2.0 * 0.85
  });

  it("multiple results with different statuses", () => {
    const statusMap = new Map<number, "overturned" | "superseded" | "confirmed">([
      [1, "overturned"],
      [2, "superseded"],
      [3, "confirmed"],
    ]);
    const results = [
      makeResult("legal/judikatur/at/ogh/2024-01-15-a", 1.0, 1),
      makeResult("legal/judikatur/at/ogh/2024-01-15-b", 1.0, 2),
      makeResult("legal/judikatur/at/ogh/2024-01-15-c", 1.0, 3),
    ];
    applyCitationValidityBoost(results, statusMap);
    expect(results[0].score).toBeCloseTo(0.85, 10); // overturned
    expect(results[1].score).toBeCloseTo(0.92, 10); // superseded
    expect(results[2].score).toBeCloseTo(1.02, 10); // confirmed
  });

  it("ignores invalid status values in statusMap", () => {
    const statusMap = new Map<number, any>([[1, "invalid_status" as any]]);
    const results = [makeResult("legal/judikatur/at/ogh/2024-01-15", 1.0, 1)];
    applyCitationValidityBoost(results, statusMap);
    // "invalid_status" won't match CITATION_VALIDITY_FACTORS → factor undefined → skip
    expect(results[0].score).toBe(1.0);
  });
});
