import { describe, it, expect } from "vitest";
import {
  HARNESS_REGISTRY,
  evaluateGate,
  buildSuperbrainResult,
  buildRagResult,
  buildReleaseGateResult,
  buildAiQualityResult,
  buildFeedbackResult,
  buildExternalHarnessResult,
  getEnabledHarnesses,
  getBlockingHarnesses,
  getHarnessById,
  getHarnessStats,
  type HarnessResult,
  type HarnessId,
} from "@/lib/eval-harness-reuse";
import type { SuperbrainEvalSummary } from "@/lib/superbrain-eval";
import type { EvalSummary } from "@/lib/rag-eval";
import type { AIQualityReport } from "@/lib/ai-quality";
import type { FeedbackStats } from "@/lib/retrieval-feedback";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeSuperbrainSummary(
  overrides: Partial<SuperbrainEvalSummary> = {}
): SuperbrainEvalSummary {
  return {
    total: 9,
    passed: 8,
    failed: 1,
    pass_rate: 0.89,
    avg_coverage_score: 0.85,
    avg_gap_accuracy: 0.9,
    avg_recall_at_k: 0.8,
    avg_entity_resolution_precision: 0.95,
    avg_freshness_accuracy: 0.88,
    avg_source_leakage_rate: 0,
    byCategory: {},
    results: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeRagSummary(overrides: Partial<EvalSummary> = {}): EvalSummary {
  return {
    overallPrecision: 0.75,
    overallRecall: 0.7,
    overallMrr: 0.5,
    overallNdcg: 0.6,
    byCategory: {},
    results: [],
    timestamp: new Date().toISOString(),
    fixtureVersion: "2.0.0",
    totalQueries: 20,
    ...overrides,
  };
}

function makeAiQualityReport(overrides: Partial<AIQualityReport> = {}): AIQualityReport {
  return {
    citation: {
      total_citations: 10,
      verified_citations: 8,
      unverified_citations: 2,
      citation_verification_rate: 0.8,
      false_citation_rate: 0.2,
      corpus_checked: true,
    },
    claims: {
      total_claims: 15,
      supported_claims: 10,
      unsupported_claims: 5,
      unsupported_claim_rate: 0.33,
    },
    deadlines: {
      total_detected: 5,
      correct: 4,
      incorrect: 1,
      missed: 0,
      precision: 0.8,
      recall: 1.0,
      f1: 0.89,
    },
    contract_issues: {
      total_detected: 3,
      correct: 2,
      incorrect: 1,
      missed: 0,
      precision: 0.67,
      recall: 1.0,
      f1: 0.8,
    },
    overall_score: 0.82,
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeFeedbackStats(overrides: Partial<FeedbackStats> = {}): FeedbackStats {
  return {
    total_feedback: 50,
    by_type: { relevant: 30, irrelevant: 10, outdated: 5, wrong: 5 },
    by_severity: { low: 10, medium: 25, high: 15 },
    unique_queries: 15,
    unique_results: 30,
    problematic_results: [],
    problematic_queries: [],
    satisfaction_rate: 0.6,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Eval Harness Reuse — Registry", () => {
  it("has 9 harnesses in registry", () => {
    expect(HARNESS_REGISTRY).toHaveLength(9);
  });

  it("includes all required harness ids", () => {
    const ids = HARNESS_REGISTRY.map((h) => h.id);
    expect(ids).toContain("superbrain");
    expect(ids).toContain("rag");
    expect(ids).toContain("release_gate");
    expect(ids).toContain("ai_quality");
    expect(ids).toContain("feedback");
    expect(ids).toContain("functional_area");
    expect(ids).toContain("legal_rag");
  });

  it("every harness has required fields", () => {
    for (const h of HARNESS_REGISTRY) {
      expect(h.id).toBeTruthy();
      expect(h.name).toBeTruthy();
      expect(h.description).toBeTruthy();
      expect(h.source).toBeTruthy();
    }
  });

  it("has unique ids", () => {
    const ids = HARNESS_REGISTRY.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Eval Harness Reuse — Stats", () => {
  it("getHarnessStats returns correct counts", () => {
    const stats = getHarnessStats();
    expect(stats.total).toBe(9);
    expect(stats.enabled).toBeGreaterThan(0);
    expect(stats.blocking).toBeGreaterThan(0);
    expect(stats.disabled).toBeGreaterThanOrEqual(0);
  });

  it("getEnabledHarnesses returns only enabled", () => {
    const enabled = getEnabledHarnesses();
    expect(enabled.every((h) => h.enabled)).toBe(true);
  });

  it("getBlockingHarnesses returns only blocking+enabled", () => {
    const blocking = getBlockingHarnesses();
    expect(blocking.every((h) => h.enabled && h.blocking)).toBe(true);
  });

  it("getHarnessById returns matching harness", () => {
    const h = getHarnessById("superbrain");
    expect(h).toBeDefined();
    expect(h!.name).toBe("Superbrain Eval");
  });

  it("getHarnessById returns undefined for unknown id", () => {
    expect(getHarnessById("nonexistent" as HarnessId)).toBeUndefined();
  });
});

describe("Eval Harness Reuse — Gate Evaluation", () => {
  it("returns pass when all blocking harnesses pass", () => {
    const results: Partial<Record<HarnessId, HarnessResult>> = {
      superbrain: buildSuperbrainResult(makeSuperbrainSummary()),
      rag: buildRagResult(makeRagSummary()),
      release_gate: buildReleaseGateResult("pass"),
      ai_quality: buildAiQualityResult(makeAiQualityReport()),
    };
    const gate = evaluateGate(results);
    expect(gate.overall_status).toBe("pass");
    expect(gate.gate_passed).toBe(true);
  });

  it("returns fail when any blocking harness fails", () => {
    const results: Partial<Record<HarnessId, HarnessResult>> = {
      superbrain: buildSuperbrainResult(makeSuperbrainSummary(), ["coverage too low"]),
      rag: buildRagResult(makeRagSummary()),
      release_gate: buildReleaseGateResult("pass"),
      ai_quality: buildAiQualityResult(makeAiQualityReport()),
    };
    const gate = evaluateGate(results);
    expect(gate.overall_status).toBe("fail");
    expect(gate.gate_passed).toBe(false);
    expect(gate.all_breaches.length).toBeGreaterThan(0);
  });

  it("returns warn when advisory harness warns", () => {
    const results: Partial<Record<HarnessId, HarnessResult>> = {
      superbrain: buildSuperbrainResult(makeSuperbrainSummary()),
      rag: buildRagResult(makeRagSummary()),
      release_gate: buildReleaseGateResult("pass"),
      ai_quality: buildAiQualityResult(makeAiQualityReport()),
      feedback: buildFeedbackResult(makeFeedbackStats({ satisfaction_rate: 0.3 }), 0.5),
    };
    const gate = evaluateGate(results);
    expect(gate.overall_status).toBe("warn");
    expect(gate.gate_passed).toBe(true);
  });

  it("marks not_run for missing enabled harnesses", () => {
    const gate = evaluateGate({});
    const notRun = gate.harnesses.filter((h) => h.status === "not_run");
    expect(notRun.length).toBeGreaterThan(0);
  });

  it("marks skipped for disabled harnesses", () => {
    const gate = evaluateGate({});
    const skipped = gate.harnesses.filter((h) => h.status === "skipped");
    expect(skipped.length).toBeGreaterThan(0);
  });

  it("aggregates metrics from all harnesses", () => {
    const results: Partial<Record<HarnessId, HarnessResult>> = {
      superbrain: buildSuperbrainResult(makeSuperbrainSummary()),
      rag: buildRagResult(makeRagSummary()),
      ai_quality: buildAiQualityResult(makeAiQualityReport()),
      feedback: buildFeedbackResult(makeFeedbackStats()),
    };
    const gate = evaluateGate(results);
    expect(gate.aggregated_metrics.coverage_score).toBe(0.85);
    expect(gate.aggregated_metrics.precision).toBe(0.75);
    expect(gate.aggregated_metrics.citation_verification_rate).toBe(0.8);
    expect(gate.aggregated_metrics.satisfaction_rate).toBe(0.6);
  });

  it("builds summary text", () => {
    const results: Partial<Record<HarnessId, HarnessResult>> = {
      superbrain: buildSuperbrainResult(makeSuperbrainSummary()),
    };
    const gate = evaluateGate(results);
    expect(gate.summary).toContain("Gate:");
    expect(gate.summary).toContain("passed");
  });

  it("includes breaches in summary when present", () => {
    const results: Partial<Record<HarnessId, HarnessResult>> = {
      superbrain: buildSuperbrainResult(makeSuperbrainSummary(), ["coverage breach"]),
    };
    const gate = evaluateGate(results);
    expect(gate.summary).toContain("breach");
    expect(gate.all_breaches.some((b) => b.includes("coverage breach"))).toBe(true);
  });

  it("sets evaluated_at timestamp", () => {
    const gate = evaluateGate({});
    expect(gate.evaluated_at).toBeTruthy();
  });
});

describe("Eval Harness Reuse — Result Builders", () => {
  it("buildSuperbrainResult maps metrics correctly", () => {
    const summary = makeSuperbrainSummary();
    const result = buildSuperbrainResult(summary);
    expect(result.harness_id).toBe("superbrain");
    expect(result.metrics.avg_coverage_score).toBe(0.85);
    expect(result.metrics.total_fixtures).toBe(9);
    expect(result.metrics.passed_fixtures).toBe(8);
  });

  it("buildSuperbrainResult warns on source leakage > 0", () => {
    const summary = makeSuperbrainSummary({ avg_source_leakage_rate: 0.05 });
    const result = buildSuperbrainResult(summary);
    expect(result.status).toBe("warn");
  });

  it("buildRagResult maps metrics correctly", () => {
    const summary = makeRagSummary();
    const result = buildRagResult(summary);
    expect(result.harness_id).toBe("rag");
    expect(result.metrics.precision).toBe(0.75);
    expect(result.metrics.recall).toBe(0.7);
    expect(result.metrics.mrr).toBe(0.5);
  });

  it("buildRagResult detects threshold breaches", () => {
    const summary = makeRagSummary({ overallPrecision: 0.3 });
    const result = buildRagResult(summary, { min_precision: 0.5 });
    expect(result.status).toBe("fail");
    expect(result.breaches).toBeDefined();
    expect(result.breaches!.length).toBeGreaterThan(0);
  });

  it("buildReleaseGateResult maps status correctly", () => {
    expect(buildReleaseGateResult("pass").status).toBe("pass");
    expect(buildReleaseGateResult("warn").status).toBe("warn");
    expect(buildReleaseGateResult("fail").status).toBe("fail");
  });

  it("buildAiQualityResult maps nested metrics", () => {
    const report = makeAiQualityReport();
    const result = buildAiQualityResult(report);
    expect(result.metrics.citation_verification_rate).toBe(0.8);
    expect(result.metrics.false_citation_rate).toBe(0.2);
    expect(result.metrics.deadline_f1).toBe(0.89);
    expect(result.metrics.contract_issue_f1).toBe(0.8);
  });

  it("buildAiQualityResult handles null deadlines/contract_issues", () => {
    const report = makeAiQualityReport({ deadlines: null, contract_issues: null });
    const result = buildAiQualityResult(report);
    expect(result.metrics.deadline_f1).toBe(0);
    expect(result.metrics.contract_issue_f1).toBe(0);
  });

  it("buildAiQualityResult detects citation threshold breach", () => {
    const report = makeAiQualityReport();
    report.citation.citation_verification_rate = 0.5;
    const result = buildAiQualityResult(report, { min_citation_verification: 0.7 });
    expect(result.status).toBe("fail");
    expect(result.breaches).toBeDefined();
  });

  it("buildFeedbackResult maps stats correctly", () => {
    const stats = makeFeedbackStats();
    const result = buildFeedbackResult(stats);
    expect(result.harness_id).toBe("feedback");
    expect(result.metrics.satisfaction_rate).toBe(0.6);
    expect(result.metrics.total_feedback).toBe(50);
  });

  it("buildFeedbackResult warns on low satisfaction with enough data", () => {
    const stats = makeFeedbackStats({ satisfaction_rate: 0.3, total_feedback: 20 });
    const result = buildFeedbackResult(stats, 0.5);
    expect(result.status).toBe("warn");
    expect(result.breaches).toBeDefined();
  });

  it("buildFeedbackResult does not warn with insufficient data", () => {
    const stats = makeFeedbackStats({ satisfaction_rate: 0.1, total_feedback: 5 });
    const result = buildFeedbackResult(stats, 0.5);
    expect(result.status).toBe("pass");
  });

  it("buildExternalHarnessResult creates result for external evals", () => {
    const result = buildExternalHarnessResult(
      "functional_area",
      "Functional Area Resolver",
      "Routing accuracy",
      { accuracy: 0.92, total: 100 }
    );
    expect(result.harness_id).toBe("functional_area");
    expect(result.status).toBe("pass");
    expect(result.metrics.accuracy).toBe(0.92);
  });

  it("buildExternalHarnessResult warns on breaches", () => {
    const result = buildExternalHarnessResult(
      "legal_rag",
      "Legal RAG",
      "Legal RAG eval",
      { precision: 0.4 },
      ["precision below threshold"]
    );
    expect(result.status).toBe("warn");
    expect(result.breaches).toBeDefined();
  });
});
