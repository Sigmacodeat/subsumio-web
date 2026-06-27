import { describe, it, expect } from "vitest";
import {
  runSuperbrainEval,
  SUPERBRAIN_EVAL_FIXTURES,
  computeRecallAtK,
  computeEntityResolutionPrecision,
  computeFreshnessAccuracy,
  type MatterContextForEval,
} from "@/lib/superbrain-eval";

function makeMockContext(overrides: Partial<MatterContextForEval> = {}): MatterContextForEval {
  return {
    parties: [],
    deadlines: [],
    documents: [],
    coverage: {
      completeness_score: 0,
      sources: [],
    },
    gaps: [],
    engine_reachable: true,
    ...overrides,
  };
}

describe("runSuperbrainEval", () => {
  it("returns summary with correct totals", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, SUPERBRAIN_EVAL_FIXTURES);
    expect(summary.total).toBe(SUPERBRAIN_EVAL_FIXTURES.length);
    expect(summary.passed + summary.failed).toBe(summary.total);
    expect(summary.timestamp).toBeTruthy();
  });

  it("passes when all expected gaps are found", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "gaps-missing-vollmacht")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        parties: [{ slug: "c1", name: "Client", role: "client" }],
        gaps: [{ type: "missing_power_of_attorney", severity: "high", title: "Vollmacht fehlt" }],
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.passed).toBe(1);
    expect(summary.results[0].gap_accuracy).toBe(1);
  });

  it("fails when expected gaps are missing", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "gaps-overdue-deadline")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        deadlines: [{ id: "d1", title: "Frist", date: "2025-01-01", urgency: "normal" }],
        gaps: [],
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.failed).toBe(1);
    expect(summary.results[0].gap_accuracy).toBe(0);
  });

  it("detects source leakage in permission tests", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "permissions-no-leakage")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        coverage: {
          completeness_score: 0.5,
          sources: [{ source_id: "opposing_counsel_notes", source_type: "dms", connected: true }],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.failed).toBe(1);
    const leakCheck = summary.results[0].checks.find((c) => c.name === "no_source_leakage");
    expect(leakCheck?.passed).toBe(false);
  });

  it("passes permission test when no forbidden sources present", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "permissions-no-leakage")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        coverage: {
          completeness_score: 0.5,
          sources: [{ source_id: "upload", source_type: "upload", connected: true }],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.passed).toBe(1);
  });

  it("handles context fetcher returning null", async () => {
    const fetcher = async (): Promise<MatterContextForEval | null> => null;
    const summary = await runSuperbrainEval(fetcher, [SUPERBRAIN_EVAL_FIXTURES[0]]);
    expect(summary.failed).toBe(1);
    expect(summary.results[0].checks[0].name).toBe("context_fetch");
  });

  it("handles context fetcher throwing", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => {
      throw new Error("engine down");
    };
    const summary = await runSuperbrainEval(fetcher, [SUPERBRAIN_EVAL_FIXTURES[0]]);
    expect(summary.failed).toBe(1);
    const errorCheck = summary.results[0].checks.find((c) => c.name === "no_exception");
    expect(errorCheck?.passed).toBe(false);
  });

  it("calculates byCategory breakdown correctly", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, SUPERBRAIN_EVAL_FIXTURES);
    expect(summary.byCategory.coverage).toBeDefined();
    expect(summary.byCategory.gaps).toBeDefined();
    expect(summary.byCategory.permissions).toBeDefined();
    expect(summary.byCategory.temporal).toBeDefined();
    expect(summary.byCategory.explainability).toBeDefined();
  });

  it("calculates pass_rate correctly", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, SUPERBRAIN_EVAL_FIXTURES);
    expect(summary.pass_rate).toBeGreaterThanOrEqual(0);
    expect(summary.pass_rate).toBeLessThanOrEqual(1);
  });

  it("measures duration_ms for each result", async () => {
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, [SUPERBRAIN_EVAL_FIXTURES[0]]);
    expect(summary.results[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("checks parties_min threshold", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "gaps-missing-vollmacht")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        parties: [{ slug: "c1", name: "Client", role: "client" }],
        gaps: [{ type: "missing_power_of_attorney", severity: "high", title: "test" }],
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    const partiesCheck = summary.results[0].checks.find((c) => c.name === "parties_min");
    expect(partiesCheck?.passed).toBe(true);
    expect(partiesCheck?.actual).toBe("1");
  });

  it("checks coverage_min threshold", async () => {
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        coverage: { completeness_score: 0.8, sources: [] },
      });
    const summary = await runSuperbrainEval(fetcher, [SUPERBRAIN_EVAL_FIXTURES[0]]);
    const coverageCheck = summary.results[0].checks.find((c) => c.name === "coverage_min");
    expect(coverageCheck?.passed).toBe(true);
  });
});

// ── computeRecallAtK ──────────────────────────────────────────────────

describe("computeRecallAtK", () => {
  it("returns 1 when all relevant items are in top-K", () => {
    const relevant = ["a", "b", "c"];
    const returned = ["a", "b", "c", "d", "e"];
    expect(computeRecallAtK(relevant, returned, 5)).toBe(1);
  });

  it("returns 0 when no relevant items are in top-K", () => {
    const relevant = ["a", "b"];
    const returned = ["x", "y", "z"];
    expect(computeRecallAtK(relevant, returned, 3)).toBe(0);
  });

  it("returns partial score when some relevant items are in top-K", () => {
    const relevant = ["a", "b", "c", "d"];
    const returned = ["a", "x", "b", "y", "z"];
    expect(computeRecallAtK(relevant, returned, 5)).toBe(0.5);
  });

  it("respects K limit — only counts items in first K positions", () => {
    const relevant = ["a", "b"];
    const returned = ["x", "y", "a", "b"];
    // K=2: only "x","y" in top-2 → 0 relevant found
    expect(computeRecallAtK(relevant, returned, 2)).toBe(0);
    // K=4: all in top-4 → 1.0
    expect(computeRecallAtK(relevant, returned, 4)).toBe(1);
  });

  it("returns 1 when relevant list is empty", () => {
    expect(computeRecallAtK([], ["a", "b"], 2)).toBe(1);
  });

  it("handles K larger than returned list", () => {
    const relevant = ["a", "b"];
    const returned = ["a", "b"];
    expect(computeRecallAtK(relevant, returned, 10)).toBe(1);
  });

  it("handles duplicates in returned list correctly", () => {
    const relevant = ["a", "b"];
    const returned = ["a", "a", "a", "b"];
    expect(computeRecallAtK(relevant, returned, 4)).toBe(1);
  });
});

// ── computeEntityResolutionPrecision ──────────────────────────────────

describe("computeEntityResolutionPrecision", () => {
  it("returns 1 when all entities are correctly resolved", () => {
    const resolved = [
      { slug: "c1", canonical: "Client A", correct: true },
      { slug: "c2", canonical: "Opponent B", correct: true },
    ];
    expect(computeEntityResolutionPrecision(resolved)).toBe(1);
  });

  it("returns 0 when no entities are correctly resolved", () => {
    const resolved = [
      { slug: "c1", canonical: "Wrong", correct: false },
      { slug: "c2", canonical: "Also Wrong", correct: false },
    ];
    expect(computeEntityResolutionPrecision(resolved)).toBe(0);
  });

  it("returns 0.5 when half are correct", () => {
    const resolved = [
      { slug: "c1", canonical: "Client A", correct: true },
      { slug: "c2", canonical: "Wrong", correct: false },
    ];
    expect(computeEntityResolutionPrecision(resolved)).toBe(0.5);
  });

  it("returns 1 for empty list", () => {
    expect(computeEntityResolutionPrecision([])).toBe(1);
  });

  it("handles single correct entity", () => {
    const resolved = [{ slug: "c1", canonical: "Court X", correct: true }];
    expect(computeEntityResolutionPrecision(resolved)).toBe(1);
  });

  it("handles single incorrect entity", () => {
    const resolved = [{ slug: "c1", canonical: "Wrong", correct: false }];
    expect(computeEntityResolutionPrecision(resolved)).toBe(0);
  });
});

// ── computeFreshnessAccuracy ──────────────────────────────────────────

describe("computeFreshnessAccuracy", () => {
  it("returns 1 when all freshness statuses are correct", () => {
    const sources = [
      { source_id: "s1", expected_fresh: true, actual_fresh: true },
      { source_id: "s2", expected_fresh: false, actual_fresh: false },
    ];
    expect(computeFreshnessAccuracy(sources)).toBe(1);
  });

  it("returns 0 when all freshness statuses are wrong", () => {
    const sources = [
      { source_id: "s1", expected_fresh: true, actual_fresh: false },
      { source_id: "s2", expected_fresh: false, actual_fresh: true },
    ];
    expect(computeFreshnessAccuracy(sources)).toBe(0);
  });

  it("returns 0.5 when half are correct", () => {
    const sources = [
      { source_id: "s1", expected_fresh: true, actual_fresh: true },
      { source_id: "s2", expected_fresh: true, actual_fresh: false },
    ];
    expect(computeFreshnessAccuracy(sources)).toBe(0.5);
  });

  it("returns 1 for empty list", () => {
    expect(computeFreshnessAccuracy([])).toBe(1);
  });

  it("handles single correct source", () => {
    const sources = [{ source_id: "s1", expected_fresh: true, actual_fresh: true }];
    expect(computeFreshnessAccuracy(sources)).toBe(1);
  });

  it("handles single incorrect source", () => {
    const sources = [{ source_id: "s1", expected_fresh: true, actual_fresh: false }];
    expect(computeFreshnessAccuracy(sources)).toBe(0);
  });
});

// ── runSuperbrainEval — advanced metric integration ───────────────────

describe("runSuperbrainEval — advanced metrics", () => {
  it("computes recall_at_k when fixture expects it", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "recall-at-k-documents")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        retrieval_results: {
          relevant_slugs: ["docs/a", "docs/b", "docs/c", "docs/d", "docs/e"],
          returned_slugs: ["docs/a", "docs/b", "docs/c", "docs/d", "docs/e", "docs/f"],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].recall_at_k).toBe(1);
    const recallCheck = summary.results[0].checks.find((c) => c.name === "recall_at_k");
    expect(recallCheck?.passed).toBe(true);
  });

  it("fails recall_at_k when score is below threshold", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "recall-at-k-documents")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        retrieval_results: {
          relevant_slugs: ["docs/a", "docs/b", "docs/c", "docs/d", "docs/e"],
          returned_slugs: ["docs/x", "docs/y", "docs/z", "docs/a", "docs/b"],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].recall_at_k).toBe(0.4);
    const recallCheck = summary.results[0].checks.find((c) => c.name === "recall_at_k");
    expect(recallCheck?.passed).toBe(false);
  });

  it("computes entity_resolution_precision when fixture expects it", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "entity-resolution-precision")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        entity_resolutions: {
          resolved: [
            { slug: "c1", canonical: "Client A", correct: true },
            { slug: "c2", canonical: "Opponent B", correct: true },
            { slug: "c3", canonical: "Court C", correct: true },
            { slug: "c4", canonical: "Wrong", correct: false },
          ],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].entity_resolution_precision).toBe(0.75);
    const erCheck = summary.results[0].checks.find((c) => c.name === "entity_resolution_precision");
    expect(erCheck?.passed).toBe(false); // 0.75 < 0.9
  });

  it("passes entity_resolution_precision when score meets threshold", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "entity-resolution-precision")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        entity_resolutions: {
          resolved: [
            { slug: "c1", canonical: "Client A", correct: true },
            { slug: "c2", canonical: "Opponent B", correct: true },
            { slug: "c3", canonical: "Court C", correct: true },
            { slug: "c4", canonical: "Also Correct", correct: true },
          ],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].entity_resolution_precision).toBe(1);
    expect(summary.passed).toBe(1);
  });

  it("computes freshness_accuracy when fixture expects it", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "freshness-accuracy")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        source_freshness: {
          sources: [
            { source_id: "s1", expected_fresh: true, actual_fresh: true },
            { source_id: "s2", expected_fresh: true, actual_fresh: true },
            { source_id: "s3", expected_fresh: false, actual_fresh: false },
            { source_id: "s4", expected_fresh: true, actual_fresh: false },
          ],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].freshness_accuracy).toBe(0.75);
    const faCheck = summary.results[0].checks.find((c) => c.name === "freshness_accuracy");
    expect(faCheck?.passed).toBe(false); // 0.75 < 0.8
  });

  it("passes freshness_accuracy when score meets threshold", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "freshness-accuracy")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        source_freshness: {
          sources: [
            { source_id: "s1", expected_fresh: true, actual_fresh: true },
            { source_id: "s2", expected_fresh: false, actual_fresh: false },
            { source_id: "s3", expected_fresh: true, actual_fresh: true },
            { source_id: "s4", expected_fresh: false, actual_fresh: false },
          ],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].freshness_accuracy).toBe(1);
    expect(summary.passed).toBe(1);
  });

  it("computes source_leakage_rate for forbidden sources", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "source-leakage-rate-zero")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        coverage: {
          completeness_score: 0.5,
          sources: [
            { source_id: "upload", source_type: "upload", connected: true },
            { source_id: "email", source_type: "email", connected: true },
          ],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].source_leakage_rate).toBe(0);
    expect(summary.passed).toBe(1);
  });

  it("detects source leakage when forbidden source is present", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "source-leakage-rate-zero")!;
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        coverage: {
          completeness_score: 0.5,
          sources: [
            { source_id: "opposing_counsel_notes", source_type: "dms", connected: true },
            { source_id: "upload", source_type: "upload", connected: true },
          ],
        },
      });
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].source_leakage_rate).toBeCloseTo(1 / 3, 5);
    expect(summary.failed).toBe(1);
  });

  it("includes new metrics in summary averages", async () => {
    const fixtures = [
      SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "recall-at-k-documents")!,
      SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "entity-resolution-precision")!,
      SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "freshness-accuracy")!,
    ];
    const fetcher = async (): Promise<MatterContextForEval> =>
      makeMockContext({
        retrieval_results: {
          relevant_slugs: ["a", "b"],
          returned_slugs: ["a", "b", "c"],
        },
        entity_resolutions: {
          resolved: [
            { slug: "c1", canonical: "X", correct: true },
            { slug: "c2", canonical: "Y", correct: true },
          ],
        },
        source_freshness: {
          sources: [{ source_id: "s1", expected_fresh: true, actual_fresh: true }],
        },
      });
    const summary = await runSuperbrainEval(fetcher, fixtures);
    expect(summary.avg_recall_at_k).toBeGreaterThan(0);
    expect(summary.avg_entity_resolution_precision).toBeGreaterThan(0);
    expect(summary.avg_freshness_accuracy).toBeGreaterThan(0);
    expect(summary.avg_source_leakage_rate).toBeGreaterThanOrEqual(0);
  });

  it("nulls metrics when context lacks advanced data", async () => {
    const fixture = SUPERBRAIN_EVAL_FIXTURES.find((f) => f.id === "recall-at-k-documents")!;
    const fetcher = async (): Promise<MatterContextForEval> => makeMockContext();
    const summary = await runSuperbrainEval(fetcher, [fixture]);
    expect(summary.results[0].recall_at_k).toBeNull();
    expect(summary.results[0].entity_resolution_precision).toBeNull();
    expect(summary.results[0].freshness_accuracy).toBeNull();
  });
});
