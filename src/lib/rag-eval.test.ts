import { describe, it, expect } from "vitest";
import {
  runEval,
  scoreGrade,
  EVAL_FIXTURES,
  FIXTURE_VERSION,
  type EvalQuery,
  type EvalSummary,
} from "./rag-eval";
import { evaluateReleaseGate, DEFAULT_THRESHOLDS } from "./release-gate";
import {
  computeCitationQuality,
  computeDeadlineQuality,
  computeContractIssueQuality,
  computeQualityReport,
  qualityGrade,
  type ExpectedDeadline,
  type DetectedContractIssue,
  type ExpectedContractIssue,
} from "./ai-quality";
import type { GroundingMetadata } from "./citation-gate";
import type { DetectedDeadline } from "./ai-deadline-detect";

// ── EVAL_FIXTURES ───────────────────────────────────────────────────────

describe("EVAL_FIXTURES", () => {
  it("contains at least 15 fixtures", () => {
    expect(EVAL_FIXTURES.length).toBeGreaterThanOrEqual(15);
  });

  it("all fixtures have unique ids", () => {
    const ids = EVAL_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all fixtures have non-empty query", () => {
    for (const f of EVAL_FIXTURES) {
      expect(f.query.length).toBeGreaterThan(0);
    }
  });

  it("all fixtures have at least one expectedSlug", () => {
    for (const f of EVAL_FIXTURES) {
      expect(f.expectedSlugs.length).toBeGreaterThan(0);
    }
  });

  it("covers DE, AT, and CH jurisdictions", () => {
    const jurisdictions = new Set(EVAL_FIXTURES.map((f) => f.jurisdiction));
    expect(jurisdictions.has("DE")).toBe(true);
    expect(jurisdictions.has("AT")).toBe(true);
    expect(jurisdictions.has("CH")).toBe(true);
  });

  it("covers all major categories", () => {
    const categories = new Set(EVAL_FIXTURES.map((f) => f.category));
    expect(categories.has("statute")).toBe(true);
    expect(categories.has("procedure")).toBe(true);
    expect(categories.has("general")).toBe(true);
    expect(categories.has("contract_clause")).toBe(true);
    expect(categories.has("memo")).toBe(true);
    expect(categories.has("bulk_review")).toBe(true);
  });
});

// ── FIXTURE_VERSION ─────────────────────────────────────────────────────

describe("FIXTURE_VERSION", () => {
  it("is a semver string", () => {
    expect(FIXTURE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is at least 2.0.0", () => {
    const [major] = FIXTURE_VERSION.split(".").map(Number);
    expect(major).toBeGreaterThanOrEqual(2);
  });
});

// ── runEval ─────────────────────────────────────────────────────────────

describe("runEval", () => {
  it("returns EvalSummary with overall metrics", async () => {
    const retriever = async (_q: string) => ["legal/norms/bgb-433"];
    const summary = await runEval(retriever, EVAL_FIXTURES.slice(0, 3));

    expect(summary.overallPrecision).toBeGreaterThanOrEqual(0);
    expect(summary.overallPrecision).toBeLessThanOrEqual(1);
    expect(summary.overallRecall).toBeGreaterThanOrEqual(0);
    expect(summary.overallRecall).toBeLessThanOrEqual(1);
    expect(summary.overallMrr).toBeGreaterThanOrEqual(0);
    expect(summary.overallMrr).toBeLessThanOrEqual(1);
    expect(summary.overallNdcg).toBeGreaterThanOrEqual(0);
    expect(summary.overallNdcg).toBeLessThanOrEqual(1);
  });

  it("returns results for each fixture query", async () => {
    const retriever = async (_q: string) => [];
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "test1", expectedSlugs: ["s1"], category: "statute" },
      { id: "t2", query: "test2", expectedSlugs: ["s2"], category: "procedure" },
    ];
    const summary = await runEval(retriever, fixtures);

    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].queryId).toBe("t1");
    expect(summary.results[1].queryId).toBe("t2");
  });

  it("includes fixtureVersion in summary", async () => {
    const retriever = async (_q: string) => [];
    const summary = await runEval(retriever, [EVAL_FIXTURES[0]]);
    expect(summary.fixtureVersion).toBe(FIXTURE_VERSION);
  });

  it("includes totalQueries in summary", async () => {
    const retriever = async (_q: string) => [];
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "test1", expectedSlugs: ["s1"], category: "statute" },
      { id: "t2", query: "test2", expectedSlugs: ["s2"], category: "procedure" },
      { id: "t3", query: "test3", expectedSlugs: ["s3"], category: "general" },
    ];
    const summary = await runEval(retriever, fixtures);
    expect(summary.totalQueries).toBe(3);
  });

  it("includes timestamp in summary", async () => {
    const retriever = async (_q: string) => [];
    const summary = await runEval(retriever, [EVAL_FIXTURES[0]]);
    expect(summary.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("calculates precision=1 when all retrieved are relevant", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a", "b"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].precision).toBe(1);
  });

  it("calculates precision=0 when none are relevant", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["x", "y"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].precision).toBe(0);
  });

  it("calculates recall=1 when all relevant are found", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a", "b"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b", "c"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].recall).toBe(1);
  });

  it("calculates recall=0.5 when half relevant are found", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a", "b"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "c"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].recall).toBe(0.5);
  });

  it("calculates MRR=1 when first result is relevant", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b", "c"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].mrr).toBe(1);
  });

  it("calculates MRR=0.5 when second result is relevant", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["b"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b", "c"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].mrr).toBe(0.5);
  });

  it("calculates MRR=0 when no relevant result", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["z"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b", "c"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].mrr).toBe(0);
  });

  it("calculates NDCG correctly for perfect ranking", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a", "b"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].ndcg).toBe(1);
  });

  it("calculates NDCG=0 when no relevant results", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["z"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].ndcg).toBe(0);
  });

  it("respects K parameter", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b", "c", "d", "e"];
    const summary = await runEval(retriever, fixtures, { k: 2 });
    expect(summary.results[0].retrievedSlugs).toHaveLength(2);
  });

  it("defaults to K=10", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a"], category: "statute" },
    ];
    const retriever = async (_q: string) => [
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
    ];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].retrievedSlugs).toHaveLength(10);
  });

  it("handles empty retriever results", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a"], category: "statute" },
    ];
    const retriever = async (_q: string) => [];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].precision).toBe(0);
    expect(summary.results[0].recall).toBe(0);
    expect(summary.results[0].mrr).toBe(0);
    expect(summary.results[0].ndcg).toBe(0);
  });

  it("handles empty expectedSlugs gracefully", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: [], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a", "b"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.results[0].recall).toBe(0);
  });

  it("throws on retriever error when tolerateErrors is false", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a"], category: "statute" },
    ];
    const retriever = async (_q: string) => {
      throw new Error("Connection refused");
    };
    await expect(runEval(retriever, fixtures)).rejects.toThrow("Connection refused");
  });

  it("tolerates retriever errors when tolerateErrors is true", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a"], category: "statute" },
    ];
    const retriever = async (_q: string) => {
      throw new Error("Connection refused");
    };
    const summary = await runEval(retriever, fixtures, { tolerateErrors: true });
    expect(summary.results[0].precision).toBe(0);
    expect(summary.results[0].recall).toBe(0);
    expect(summary.results[0].mrr).toBe(0);
  });

  it("groups results by category in byCategory", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q1", expectedSlugs: ["a"], category: "statute" },
      { id: "t2", query: "q2", expectedSlugs: ["b"], category: "procedure" },
      { id: "t3", query: "q3", expectedSlugs: ["c"], category: "statute" },
    ];
    const retriever = async (q: string) => (q === "q1" ? ["a"] : q === "q2" ? ["b"] : ["c"]);
    const summary = await runEval(retriever, fixtures);
    expect(summary.byCategory["statute"]).toBeDefined();
    expect(summary.byCategory["statute"].count).toBe(2);
    expect(summary.byCategory["procedure"]).toBeDefined();
    expect(summary.byCategory["procedure"].count).toBe(1);
  });

  it("does not include empty categories in byCategory", async () => {
    const fixtures: EvalQuery[] = [
      { id: "t1", query: "q", expectedSlugs: ["a"], category: "statute" },
    ];
    const retriever = async (_q: string) => ["a"];
    const summary = await runEval(retriever, fixtures);
    expect(summary.byCategory["statute"]).toBeDefined();
    expect(summary.byCategory["case_law"]).toBeUndefined();
  });

  it("uses custom fixtures when provided", async () => {
    const customFixtures: EvalQuery[] = [
      { id: "custom1", query: "custom query", expectedSlugs: ["x"], category: "general" },
    ];
    const retriever = async (_q: string) => ["x"];
    const summary = await runEval(retriever, customFixtures);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].queryId).toBe("custom1");
    expect(summary.totalQueries).toBe(1);
  });
});

// ── scoreGrade ──────────────────────────────────────────────────────────

describe("scoreGrade", () => {
  it("returns 'Exzellent' for score >= 0.8", () => {
    const result = scoreGrade(0.9, 0.8, 0.8);
    expect(result.label).toBe("Exzellent");
    expect(result.color).toBe("emerald");
  });

  it("returns 'Gut' for score >= 0.6", () => {
    const result = scoreGrade(0.6, 0.6, 0.6);
    expect(result.label).toBe("Gut");
    expect(result.color).toBe("blue");
  });

  it("returns 'Ausreichend' for score >= 0.4", () => {
    const result = scoreGrade(0.4, 0.4, 0.4);
    expect(result.label).toBe("Ausreichend");
    expect(result.color).toBe("amber");
  });

  it("returns 'Verbesserungsbedürftig' for score < 0.4", () => {
    const result = scoreGrade(0.1, 0.1, 0.1);
    expect(result.label).toBe("Verbesserungsbedürftig");
    expect(result.color).toBe("red");
  });

  it("returns 'Exzellent' for perfect score", () => {
    const result = scoreGrade(1, 1, 1);
    expect(result.label).toBe("Exzellent");
  });

  it("returns 'Verbesserungsbedürftig' for zero score", () => {
    const result = scoreGrade(0, 0, 0);
    expect(result.label).toBe("Verbesserungsbedürftig");
  });

  it("handles boundary 0.8 exactly", () => {
    const result = scoreGrade(0.8, 0.8, 0.8);
    expect(result.label).toBe("Exzellent");
  });

  it("handles boundary 0.6 exactly", () => {
    const result = scoreGrade(0.6, 0.6, 0.6);
    expect(result.label).toBe("Gut");
  });

  it("handles boundary 0.4 exactly", () => {
    const result = scoreGrade(0.4, 0.4, 0.4);
    expect(result.label).toBe("Ausreichend");
  });
});

// ── AI Quality Metrics ─────────────────────────────────────────────────

function makeGrounding(overrides: Partial<GroundingMetadata> = {}): GroundingMetadata {
  return {
    citations_verified: 8,
    citations_unverified: 2,
    corpus_checked: true,
    grounded_citations: [],
    analyzed_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSummary(overrides: Partial<EvalSummary> = {}): EvalSummary {
  return {
    overallPrecision: 0.7,
    overallRecall: 0.6,
    overallMrr: 0.5,
    overallNdcg: 0.55,
    byCategory: {},
    results: [],
    timestamp: new Date().toISOString(),
    fixtureVersion: "2.0.0",
    totalQueries: 25,
    ...overrides,
  };
}

describe("computeCitationQuality", () => {
  it("computes rates correctly", () => {
    const grounding = makeGrounding({ citations_verified: 90, citations_unverified: 10 });
    const result = computeCitationQuality(grounding);
    expect(result.total_citations).toBe(100);
    expect(result.verified_citations).toBe(90);
    expect(result.unverified_citations).toBe(10);
    expect(result.citation_verification_rate).toBe(0.9);
    expect(result.false_citation_rate).toBe(0.1);
    expect(result.corpus_checked).toBe(true);
  });

  it("handles null grounding gracefully", () => {
    const result = computeCitationQuality(null);
    expect(result.total_citations).toBe(0);
    expect(result.citation_verification_rate).toBe(0);
    expect(result.corpus_checked).toBe(false);
  });

  it("handles zero citations gracefully", () => {
    const grounding = makeGrounding({ citations_verified: 0, citations_unverified: 0 });
    const result = computeCitationQuality(grounding);
    expect(result.citation_verification_rate).toBe(1);
    expect(result.false_citation_rate).toBe(0);
  });

  it("handles all-unverified citations", () => {
    const grounding = makeGrounding({ citations_verified: 0, citations_unverified: 10 });
    const result = computeCitationQuality(grounding);
    expect(result.citation_verification_rate).toBe(0);
    expect(result.false_citation_rate).toBe(1);
  });
});

describe("computeDeadlineQuality", () => {
  const detected: DetectedDeadline[] = [
    {
      type: "appeal",
      date: "2024-07-01",
      description: "Berufung",
      confidence: "high",
      sourceSnippet: "",
      matchedRule: "r1",
    },
    {
      type: "payment",
      daysFromNow: 14,
      description: "Zahlung",
      confidence: "medium",
      sourceSnippet: "",
      matchedRule: "r2",
    },
  ];
  const expected: ExpectedDeadline[] = [
    { type: "appeal", date: "2024-07-01" },
    { type: "payment", daysFromNow: 14 },
  ];

  it("computes perfect precision and recall", () => {
    const result = computeDeadlineQuality(detected, expected);
    expect(result.correct).toBe(2);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  it("computes false positives", () => {
    const extraDetected = [
      ...detected,
      {
        type: "hearing",
        date: "2024-08-01",
        description: "Termin",
        confidence: "low",
        sourceSnippet: "",
        matchedRule: "r3",
      },
    ];
    const result = computeDeadlineQuality(extraDetected, expected);
    expect(result.false_positives).toBe(1);
    expect(result.precision).toBeCloseTo(2 / 3, 5);
  });

  it("computes false negatives", () => {
    const extraExpected = [...expected, { type: "objection", daysFromNow: 7 }];
    const result = computeDeadlineQuality(detected, extraExpected);
    expect(result.false_negatives).toBe(1);
    expect(result.recall).toBeCloseTo(2 / 3, 5);
  });

  it("handles empty detected", () => {
    const result = computeDeadlineQuality([], expected);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });
});

describe("computeContractIssueQuality", () => {
  const detected: DetectedContractIssue[] = [
    { clause_type: "liability", risk_level: "high" },
    { clause_type: "termination", risk_level: "medium" },
  ];
  const expected: ExpectedContractIssue[] = [
    { clause_type: "liability", risk_level: "high" },
    { clause_type: "termination", risk_level: "medium" },
  ];

  it("computes perfect score", () => {
    const result = computeContractIssueQuality(detected, expected);
    expect(result.correct).toBe(2);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  it("computes false positives", () => {
    const extra = [...detected, { clause_type: "ip", risk_level: "low" }];
    const result = computeContractIssueQuality(extra, expected);
    expect(result.false_positives).toBe(1);
  });

  it("handles empty inputs", () => {
    const result = computeContractIssueQuality([], []);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
  });
});

describe("computeQualityReport", () => {
  it("computes overall score with all components", () => {
    const report = computeQualityReport({
      answerText:
        "Nach § 433 BGB muss der Verkäufer die Sache übergeben. Die Frist ist bis 30.06.2024.",
      grounding: makeGrounding({ citations_verified: 5, citations_unverified: 1 }),
      detectedDeadlines: [
        {
          type: "absolute",
          date: "2024-06-30",
          description: "Frist",
          confidence: "high",
          sourceSnippet: "",
          matchedRule: "r1",
        },
      ],
      expectedDeadlines: [{ type: "absolute", date: "2024-06-30" }],
      detectedContractIssues: [{ clause_type: "liability", risk_level: "high" }],
      expectedContractIssues: [{ clause_type: "liability", risk_level: "high" }],
    });
    expect(report.overall_score).toBeGreaterThan(0);
    expect(report.overall_score).toBeLessThanOrEqual(1);
    expect(report.citation.corpus_checked).toBe(true);
    expect(report.deadlines).not.toBeNull();
    expect(report.contract_issues).not.toBeNull();
  });

  it("handles minimal input (no deadlines/contract data)", () => {
    const report = computeQualityReport({
      answerText: "Ein Satz ohne Zitate.",
      grounding: null,
    });
    expect(report.deadlines).toBeNull();
    expect(report.contract_issues).toBeNull();
    expect(report.citation.corpus_checked).toBe(false);
  });
});

describe("qualityGrade", () => {
  it("returns Exzellent for score >= 0.85", () => {
    expect(qualityGrade(0.9).label).toBe("Exzellent");
    expect(qualityGrade(0.9).color).toBe("emerald");
  });

  it("returns Gut for score >= 0.7", () => {
    expect(qualityGrade(0.75).label).toBe("Gut");
  });

  it("returns Ausreichend for score >= 0.5", () => {
    expect(qualityGrade(0.55).label).toBe("Ausreichend");
  });

  it("returns Kritisch for score < 0.5", () => {
    expect(qualityGrade(0.3).label).toBe("Kritisch");
    expect(qualityGrade(0.3).color).toBe("red");
  });
});

// ── Release Gate ───────────────────────────────────────────────────────

describe("evaluateReleaseGate", () => {
  it("passes when all metrics meet thresholds", () => {
    const summary = makeSummary();
    const result = evaluateReleaseGate(summary, null, null);
    expect(result.status).toBe("pass");
  });

  it("fails when precision is below threshold", () => {
    const summary = makeSummary({ overallPrecision: 0.3 });
    const result = evaluateReleaseGate(summary, null, null);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.name === "precision_absolute" && c.status === "fail")).toBe(
      true
    );
  });

  it("fails when recall is below threshold", () => {
    const summary = makeSummary({ overallRecall: 0.2 });
    const result = evaluateReleaseGate(summary, null, null);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.name === "recall_absolute" && c.status === "fail")).toBe(
      true
    );
  });

  it("warns when MRR is below threshold", () => {
    const summary = makeSummary({ overallMrr: 0.1 });
    const result = evaluateReleaseGate(summary, null, null);
    expect(result.checks.some((c) => c.name === "mrr_absolute" && c.status === "warn")).toBe(true);
  });

  it("fails on precision regression vs baseline", () => {
    const baseline = makeSummary({ overallPrecision: 0.8 });
    const current = makeSummary({ overallPrecision: 0.6 });
    const result = evaluateReleaseGate(current, null, baseline);
    expect(result.status).toBe("fail");
    expect(
      result.checks.some((c) => c.name === "precision_regression" && c.status === "fail")
    ).toBe(true);
  });

  it("fails on recall regression vs baseline", () => {
    const baseline = makeSummary({ overallRecall: 0.8 });
    const current = makeSummary({ overallRecall: 0.5 });
    const result = evaluateReleaseGate(current, null, baseline);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.name === "recall_regression" && c.status === "fail")).toBe(
      true
    );
  });

  it("no regression checks when baseline is null", () => {
    const result = evaluateReleaseGate(makeSummary(), null, null);
    expect(result.checks.some((c) => c.name === "precision_regression")).toBe(false);
  });

  it("uses custom thresholds", () => {
    const summary = makeSummary({ overallPrecision: 0.45 });
    const customThresholds = { ...DEFAULT_THRESHOLDS, min_precision: 0.4 };
    const result = evaluateReleaseGate(summary, null, null, customThresholds);
    expect(result.checks.some((c) => c.name === "precision_absolute" && c.status === "pass")).toBe(
      true
    );
  });

  it("includes summary message", () => {
    const result = evaluateReleaseGate(makeSummary(), null, null);
    expect(result.summary).toBeTruthy();
  });

  it("includes eval timestamp", () => {
    const result = evaluateReleaseGate(makeSummary(), null, null);
    expect(result.eval_timestamp).toBeTruthy();
  });
});
