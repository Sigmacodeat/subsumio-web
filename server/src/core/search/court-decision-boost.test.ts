import { describe, it, expect } from "vitest";
import type { SearchResult } from "../types.ts";
import {
  applyCourtDecisionBoost,
  DEFAULT_COURT_DECISION_RECENCY_BOOST,
  DEFAULT_COURT_DECISION_AREA_BOOST,
  DEFAULT_COURT_DECISION_COURT_BOOST,
} from "./hybrid.ts";

function makeResult(slug: string, score: number, opts: Partial<SearchResult> = {}): SearchResult {
  return {
    slug,
    page_id: 1,
    title: opts.title ?? "",
    type: opts.type ?? "court_decision",
    chunk_text: "",
    chunk_source: "compiled_truth",
    chunk_id: 1,
    chunk_index: 0,
    score,
    stale: false,
    ...opts,
  };
}

const NOW = new Date("2026-07-16").getTime();

describe("court-decision-boost", () => {
  it("exports default boost multipliers", () => {
    expect(DEFAULT_COURT_DECISION_RECENCY_BOOST).toBeGreaterThan(1.0);
    expect(DEFAULT_COURT_DECISION_AREA_BOOST).toBeGreaterThan(1.0);
    expect(DEFAULT_COURT_DECISION_COURT_BOOST).toBeGreaterThan(1.0);
  });

  it("boosts recent court decisions (≤2 years)", () => {
    const recent = makeResult("legal/judikatur/at/2025-06-01-1ob1-25", 0.8);
    const results = [recent];
    applyCourtDecisionBoost(
      results,
      "Scheidung",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      1.0, // area off
      1.0, // court off
      undefined,
      NOW
    );
    expect(results[0].score).toBeGreaterThan(0.8);
    expect(results[0].court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_RECENCY_BOOST, 5);
  });

  it("does not boost decisions older than 10 years", () => {
    const old = makeResult("legal/judikatur/at/2010-06-01-1ob1-10", 0.8);
    const results = [old];
    applyCourtDecisionBoost(
      results,
      "Scheidung",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      1.0,
      1.0,
      undefined,
      NOW
    );
    expect(results[0].score).toBe(0.8);
    expect(results[0].court_decision_boost).toBeUndefined();
  });

  it("applies partial recency boost for decisions between 2 and 10 years", () => {
    // ~5 years old → proportion = 1 - (5-2)/8 = 1 - 0.375 = 0.625
    const mid = makeResult("legal/judikatur/at/2021-06-01-1ob1-21", 0.8);
    const results = [mid];
    applyCourtDecisionBoost(
      results,
      "Scheidung",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      1.0,
      1.0,
      undefined,
      NOW
    );
    expect(results[0].score).toBeGreaterThan(0.8);
    expect(results[0].score).toBeLessThan(0.8 * DEFAULT_COURT_DECISION_RECENCY_BOOST);
  });

  it("uses effective_date when available over slug date", () => {
    const r = makeResult("legal/judikatur/at/2025-06-01-1ob1-25", 0.8, {
      effective_date: "2026-06-01",
    });
    const results = [r];
    applyCourtDecisionBoost(
      results,
      "x",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      1.0,
      1.0,
      undefined,
      NOW
    );
    // ~1.5 months old → full boost
    expect(results[0].court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_RECENCY_BOOST, 5);
  });

  it("boosts decisions matching legal area from query", () => {
    const strafrecht = makeResult("legal/judikatur/at/2024-01-01-stgb-1", 0.7, {
      title: "Strafsache Betrug",
    });
    const zivil = makeResult("legal/judikatur/at/2024-01-01-zpo-1", 0.7, {
      title: "Zivilsache Klage",
    });
    const results = [strafrecht, zivil];
    applyCourtDecisionBoost(
      results,
      "Betrug und Körperverletzung im Strafrecht",
      1.0, // recency off
      DEFAULT_COURT_DECISION_AREA_BOOST,
      1.0, // court off
      undefined,
      NOW
    );
    expect(strafrecht.score).toBeGreaterThan(0.7);
    expect(strafrecht.court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_AREA_BOOST, 5);
    // zivil doesn't match strafrecht area
    expect(zivil.score).toBe(0.7);
    expect(zivil.court_decision_boost).toBeUndefined();
  });

  it("boosts decisions from court mentioned in query", () => {
    const ogh = makeResult("legal/judikatur/at/2024-01-01-1ob1-24", 0.7);
    const bgh = makeResult("legal/judikatur/de/bgh/2024-01-01-bgh-1", 0.7);
    const results = [ogh, bgh];
    applyCourtDecisionBoost(
      results,
      "Urteil des OGH zur Frage der Scheidung",
      1.0,
      1.0,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    expect(ogh.score).toBeGreaterThan(0.7);
    expect(ogh.court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_COURT_BOOST, 5);
    // bgh doesn't match OGH
    expect(bgh.score).toBe(0.7);
  });

  it("boosts BGH decisions when query mentions BGH", () => {
    const bgh = makeResult("legal/judikatur/de/bgh/2024-01-01-bgh-1", 0.7);
    const results = [bgh];
    applyCourtDecisionBoost(
      results,
      "BGH Urteil zum BGB",
      1.0,
      1.0,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    expect(bgh.court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_COURT_BOOST, 5);
  });

  it("combines recency + area + court boosts multiplicatively", () => {
    const r = makeResult("legal/judikatur/at/2025-06-01-1ob1-25", 0.5, {
      title: "StGB Strafsache Betrug",
    });
    const results = [r];
    applyCourtDecisionBoost(
      results,
      "OGH Urteil zum Betrug im Strafrecht",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      DEFAULT_COURT_DECISION_AREA_BOOST,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    const expected =
      DEFAULT_COURT_DECISION_RECENCY_BOOST *
      DEFAULT_COURT_DECISION_AREA_BOOST *
      DEFAULT_COURT_DECISION_COURT_BOOST;
    expect(r.score).toBeCloseTo(0.5 * expected, 5);
    expect(r.court_decision_boost).toBeCloseTo(expected, 5);
  });

  it("does not boost non-court-decision pages", () => {
    const statute = makeResult("legal/statutes/at/abgb/p-1234", 0.8);
    const results = [statute];
    applyCourtDecisionBoost(
      results,
      "Scheidung OGH Betrug",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      DEFAULT_COURT_DECISION_AREA_BOOST,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    expect(statute.score).toBe(0.8);
    expect(statute.court_decision_boost).toBeUndefined();
  });

  it("respects floor threshold", () => {
    const high = makeResult("legal/judikatur/at/2025-06-01-1ob1-25", 1.0);
    const low = makeResult("legal/judikatur/at/2025-06-01-2ob2-25", 0.3);
    const results = [high, low];
    applyCourtDecisionBoost(
      results,
      "Scheidung",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      1.0,
      1.0,
      0.5, // floor at 0.5
      NOW
    );
    expect(high.court_decision_boost).toBeDefined();
    expect(low.court_decision_boost).toBeUndefined();
    expect(low.score).toBe(0.3);
  });

  it("no-ops when all factors are ≤1.0", () => {
    const r = makeResult("legal/judikatur/at/2025-06-01-1ob1-25", 0.8);
    const results = [r];
    applyCourtDecisionBoost(results, "Scheidung", 1.0, 1.0, 1.0, undefined, NOW);
    expect(r.score).toBe(0.8);
    expect(r.court_decision_boost).toBeUndefined();
  });

  it("no-ops on empty results", () => {
    const results: SearchResult[] = [];
    applyCourtDecisionBoost(
      results,
      "Scheidung",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      DEFAULT_COURT_DECISION_AREA_BOOST,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    expect(results.length).toBe(0);
  });

  it("handles decisions with no parseable date in slug", () => {
    const noDate = makeResult("legal/judikatur/at/some-decision-no-date", 0.8);
    const results = [noDate];
    applyCourtDecisionBoost(
      results,
      "x",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      1.0,
      1.0,
      undefined,
      NOW
    );
    // No date → no recency boost
    expect(noDate.score).toBe(0.8);
    expect(noDate.court_decision_boost).toBeUndefined();
  });

  it("detects multiple legal areas from query", () => {
    const strafrecht = makeResult("legal/judikatur/at/2024-01-01-stgb-1", 0.7, {
      title: "Strafsache",
    });
    const insolvenz = makeResult("legal/judikatur/at/2024-01-01-io-1", 0.7, {
      title: "Insolvenzplan",
    });
    const unrelated = makeResult("legal/judikatur/at/2024-01-01-misc-1", 0.7, {
      title: "Sonstiges",
    });
    const results = [strafrecht, insolvenz, unrelated];
    applyCourtDecisionBoost(
      results,
      "Betrug und Insolvenz im Strafrecht",
      1.0,
      DEFAULT_COURT_DECISION_AREA_BOOST,
      1.0,
      undefined,
      NOW
    );
    expect(strafrecht.court_decision_boost).toBeDefined();
    expect(insolvenz.court_decision_boost).toBeDefined();
    expect(unrelated.court_decision_boost).toBeUndefined();
  });

  it("detects VfGH court from query", () => {
    const vfgh = makeResult("legal/judikatur/at/vfgh/2024-01-01-vfgh-1", 0.7);
    const results = [vfgh];
    applyCourtDecisionBoost(
      results,
      "VfGH Erkenntnis zum Grundrecht",
      1.0,
      1.0,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    expect(vfgh.court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_COURT_BOOST, 5);
  });

  it("detects BVerfG court from query", () => {
    const bverfg = makeResult("legal/judikatur/de/bverfg/2024-01-01-bverf-1", 0.7);
    const results = [bverfg];
    applyCourtDecisionBoost(
      results,
      "BVerfG Beschluss zur Verfassung",
      1.0,
      1.0,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    expect(bverfg.court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_COURT_BOOST, 5);
  });

  it("detects BGer (Swiss Federal Supreme Court) from query", () => {
    const bger = makeResult("legal/judikatur/ch/bger/2024-01-01-bge-1", 0.7);
    const results = [bger];
    applyCourtDecisionBoost(
      results,
      "BGer Urteil zum OR",
      1.0,
      1.0,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    expect(bger.court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_COURT_BOOST, 5);
  });

  it("handles query with no legal area or court mentions", () => {
    const r = makeResult("legal/judikatur/at/2025-06-01-1ob1-25", 0.8, {
      title: "Entscheidung",
    });
    const results = [r];
    applyCourtDecisionBoost(
      results,
      "allgemeine Frage",
      1.0, // recency off
      DEFAULT_COURT_DECISION_AREA_BOOST,
      DEFAULT_COURT_DECISION_COURT_BOOST,
      undefined,
      NOW
    );
    // No area or court match → no boost
    expect(r.score).toBe(0.8);
    expect(r.court_decision_boost).toBeUndefined();
  });

  it("recency boost at exactly 2 years boundary gets full boost", () => {
    // 2 years before NOW (2026-07-16) → 2024-07-16
    const r = makeResult("legal/judikatur/at/2024-07-16-1ob1-24", 0.8);
    const results = [r];
    applyCourtDecisionBoost(
      results,
      "x",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      1.0,
      1.0,
      undefined,
      NOW
    );
    expect(r.court_decision_boost).toBeCloseTo(DEFAULT_COURT_DECISION_RECENCY_BOOST, 4);
  });

  it("recency boost at exactly 10 years boundary gets no boost", () => {
    // 11 years before NOW (2026-07-16) → 2015-07-16 (safely past 10y boundary)
    const r = makeResult("legal/judikatur/at/2015-07-16-1ob1-15", 0.8);
    const results = [r];
    applyCourtDecisionBoost(
      results,
      "x",
      DEFAULT_COURT_DECISION_RECENCY_BOOST,
      1.0,
      1.0,
      undefined,
      NOW
    );
    expect(r.court_decision_boost).toBeUndefined();
    expect(r.score).toBe(0.8);
  });
});
