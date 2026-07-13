/**
 * Tests for EPIC 9 — T9.3 Model Vetting
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateVetting,
  createVettingReport,
  getVettingReport,
  getAllVettingReports,
  getReportsByModel,
  startShadowMode,
  completeShadowMode,
  promoteModel,
  compareModels,
  getVettingStats,
  DEFAULT_THRESHOLDS,
  _resetVettingStore,
  type VettingMetrics,
  type VettingThresholds,
  VETTING_STATE_LABELS_DE,
  VETTING_DIMENSION_LABELS_DE,
} from "@/lib/model-vetting";

function makeGoodMetrics(): VettingMetrics {
  return {
    citation_accuracy: 0.95,
    hallucination_rate: 0.03,
    jurisdiction_contamination_rate: 0.01,
    german_language_rate: 0.99,
    avg_latency_ms: 5000,
    p95_latency_ms: 12000,
    cost_per_1m_input_tokens: 0.14,
    cost_per_1m_output_tokens: 0.28,
    guardrail_pass_rate: 0.95,
    judge_agreement_rate: 0.9,
    judge_bias_score: 0.05,
  };
}

function makeBadMetrics(): VettingMetrics {
  return {
    citation_accuracy: 0.6,
    hallucination_rate: 0.25,
    jurisdiction_contamination_rate: 0.15,
    german_language_rate: 0.8,
    avg_latency_ms: 25000,
    p95_latency_ms: 45000,
    cost_per_1m_input_tokens: 8.0,
    cost_per_1m_output_tokens: 24.0,
    guardrail_pass_rate: 0.7,
    judge_agreement_rate: 0.6,
    judge_bias_score: 0.3,
  };
}

describe("Model Vetting", () => {
  beforeEach(() => {
    _resetVettingStore();
  });

  describe("Evaluate Vetting", () => {
    it("passes all checks with good metrics", () => {
      const { checks, overall_passed } = evaluateVetting(makeGoodMetrics());
      expect(overall_passed).toBe(true);
      expect(checks).toHaveLength(8);
      expect(checks.every((c) => c.passed)).toBe(true);
    });

    it("fails with bad metrics", () => {
      const { checks, overall_passed } = evaluateVetting(makeBadMetrics());
      expect(overall_passed).toBe(false);
      expect(checks.some((c) => !c.passed)).toBe(true);
    });

    it("checks citation accuracy dimension", () => {
      const { checks } = evaluateVetting(makeGoodMetrics());
      const citCheck = checks.find((c) => c.dimension === "citation_accuracy");
      expect(citCheck).toBeDefined();
      expect(citCheck?.passed).toBe(true);
      expect(citCheck?.metric_value).toBe(0.95);
    });

    it("checks hallucination rate dimension", () => {
      const metrics = makeGoodMetrics();
      metrics.hallucination_rate = 0.15;
      const { checks, overall_passed } = evaluateVetting(metrics);
      const hallCheck = checks.find((c) => c.dimension === "hallucination_rate");
      expect(hallCheck?.passed).toBe(false);
      expect(overall_passed).toBe(false);
    });

    it("checks latency dimension with p95", () => {
      const metrics = makeGoodMetrics();
      metrics.avg_latency_ms = 10000;
      metrics.p95_latency_ms = 35000;
      const { checks } = evaluateVetting(metrics);
      const latCheck = checks.find((c) => c.dimension === "latency");
      expect(latCheck?.passed).toBe(false);
    });

    it("uses custom thresholds", () => {
      const thresholds: VettingThresholds = {
        ...DEFAULT_THRESHOLDS,
        min_citation_accuracy: 0.99,
      };
      const { checks, overall_passed } = evaluateVetting(makeGoodMetrics(), thresholds);
      const citCheck = checks.find((c) => c.dimension === "citation_accuracy");
      expect(citCheck?.passed).toBe(false);
      expect(overall_passed).toBe(false);
    });
  });

  describe("Report Management", () => {
    it("creates a vetting report", () => {
      const report = createVettingReport({
        model_id: "openrouter:deepseek/deepseek-chat",
        model_name: "DeepSeek V4 Flash",
        baseline_model_id: "openrouter:deepseek/deepseek-v3",
        test_set: "lab-dach-dev",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      expect(report.id).toMatch(/^vetting-/);
      expect(report.state).toBe("passed");
      expect(report.overall_passed).toBe(true);
      expect(report.checks).toHaveLength(8);
      expect(report.test_set).toBe("lab-dach-dev");
    });

    it("creates a failed report with bad metrics", () => {
      const report = createVettingReport({
        model_id: "x-ai:grok-4",
        model_name: "Grok 4",
        baseline_model_id: "openrouter:deepseek/deepseek-chat",
        test_set: "lab-dach-dev",
        test_cases_count: 50,
        metrics: makeBadMetrics(),
      });

      expect(report.state).toBe("failed");
      expect(report.overall_passed).toBe(false);
    });

    it("retrieves report by id", () => {
      const report = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 10,
        metrics: makeGoodMetrics(),
      });

      const found = getVettingReport(report.id);
      expect(found).toBeDefined();
      expect(found?.model_id).toBe("test-model");
    });

    it("lists all reports sorted by date", () => {
      createVettingReport({
        model_id: "model-a",
        model_name: "A",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 10,
        metrics: makeGoodMetrics(),
      });
      createVettingReport({
        model_id: "model-b",
        model_name: "B",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 10,
        metrics: makeGoodMetrics(),
      });

      const all = getAllVettingReports();
      expect(all).toHaveLength(2);
    });

    it("filters reports by model", () => {
      createVettingReport({
        model_id: "model-a",
        model_name: "A",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 10,
        metrics: makeGoodMetrics(),
      });
      createVettingReport({
        model_id: "model-b",
        model_name: "B",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 10,
        metrics: makeGoodMetrics(),
      });

      const modelAReports = getReportsByModel("model-a");
      expect(modelAReports).toHaveLength(1);
    });
  });

  describe("Shadow Mode", () => {
    it("starts shadow mode for passed report", () => {
      const report = createVettingReport({
        model_id: "new-model",
        model_name: "New Model",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const shadow = startShadowMode(report.id, {
        traffic_percentage: 10,
        duration_hours: 24,
        compare_dimensions: ["citation_accuracy", "hallucination_rate", "latency"],
      });

      expect(shadow.state).toBe("shadow");
      expect(shadow.shadow_config).toBeDefined();
      expect(shadow.shadow_config?.traffic_percentage).toBe(10);
    });

    it("throws when starting shadow mode for failed report", () => {
      const report = createVettingReport({
        model_id: "bad-model",
        model_name: "Bad",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeBadMetrics(),
      });

      expect(() =>
        startShadowMode(report.id, {
          traffic_percentage: 10,
          duration_hours: 24,
          compare_dimensions: [],
        })
      ).toThrow(/passed vetting/);
    });

    it("completes shadow mode with promote recommendation", () => {
      const report = createVettingReport({
        model_id: "good-model",
        model_name: "Good",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      startShadowMode(report.id, {
        traffic_percentage: 20,
        duration_hours: 48,
        compare_dimensions: ["citation_accuracy"],
      });

      const completed = completeShadowMode(report.id, {
        total_shadow_requests: 1000,
        total_baseline_requests: 9000,
        divergence_rate: 0.05,
        citation_divergence_rate: 0.02,
        latency_diff_ms: -500,
        cost_diff_per_1k: -0.5,
        satisfaction_diff: 0.1,
        recommendation: "promote",
      });

      expect(completed.state).toBe("promoted");
      expect(completed.shadow_results).toBeDefined();
      expect(completed.shadow_results?.recommendation).toBe("promote");
    });

    it("completes shadow mode with rollback recommendation", () => {
      const report = createVettingReport({
        model_id: "risky-model",
        model_name: "Risky",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      startShadowMode(report.id, {
        traffic_percentage: 10,
        duration_hours: 24,
        compare_dimensions: [],
      });

      const completed = completeShadowMode(report.id, {
        total_shadow_requests: 500,
        total_baseline_requests: 9500,
        divergence_rate: 0.3,
        citation_divergence_rate: 0.15,
        latency_diff_ms: 5000,
        cost_diff_per_1k: 2.0,
        satisfaction_diff: -0.2,
        recommendation: "rollback",
      });

      expect(completed.state).toBe("failed");
    });

    it("completes shadow mode with keep_shadow recommendation", () => {
      const report = createVettingReport({
        model_id: "shadow-model",
        model_name: "Shadow",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      startShadowMode(report.id, {
        traffic_percentage: 15,
        duration_hours: 72,
        compare_dimensions: [],
      });

      const completed = completeShadowMode(report.id, {
        total_shadow_requests: 2000,
        total_baseline_requests: 8000,
        divergence_rate: 0.1,
        citation_divergence_rate: 0.03,
        latency_diff_ms: 200,
        cost_diff_per_1k: 0.1,
        satisfaction_diff: 0.02,
        recommendation: "keep_shadow",
      });

      expect(completed.state).toBe("shadow");
    });
  });

  describe("Promote Model", () => {
    it("promotes from shadow state", () => {
      const report = createVettingReport({
        model_id: "promote-model",
        model_name: "Promote",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      startShadowMode(report.id, {
        traffic_percentage: 20,
        duration_hours: 48,
        compare_dimensions: [],
      });

      const promoted = promoteModel(report.id, "reviewer-001", "Excellent performance");
      expect(promoted.state).toBe("promoted");
      expect(promoted.reviewer_id).toBe("reviewer-001");
      expect(promoted.notes).toBe("Excellent performance");
    });

    it("promotes from passed state directly", () => {
      const report = createVettingReport({
        model_id: "direct-promote",
        model_name: "Direct",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const promoted = promoteModel(report.id, "reviewer-001");
      expect(promoted.state).toBe("promoted");
    });

    it("throws when promoting from failed state", () => {
      const report = createVettingReport({
        model_id: "failed-model",
        model_name: "Failed",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeBadMetrics(),
      });

      expect(() => promoteModel(report.id, "reviewer-001")).toThrow(/shadow or passed/);
    });
  });

  describe("Model Comparison", () => {
    it("compares two models and finds improvements", () => {
      const baseline = makeGoodMetrics();
      const candidate = makeGoodMetrics();
      candidate.citation_accuracy = 0.98;
      candidate.hallucination_rate = 0.01;
      candidate.avg_latency_ms = 3000;

      const comparison = compareModels(baseline, candidate);
      expect(comparison.deltas.citation_accuracy).toBeGreaterThan(0);
      expect(comparison.deltas.hallucination_rate).toBeLessThan(0);
      expect(comparison.deltas.avg_latency_ms).toBeLessThan(0);
      expect(comparison.improvements.length).toBeGreaterThan(0);
      expect(comparison.regressions).toHaveLength(0);
    });

    it("compares two models and finds regressions", () => {
      const baseline = makeGoodMetrics();
      const candidate = makeGoodMetrics();
      candidate.citation_accuracy = 0.8;
      candidate.hallucination_rate = 0.12;
      candidate.avg_latency_ms = 8000;

      const comparison = compareModels(baseline, candidate);
      expect(comparison.deltas.citation_accuracy).toBeLessThan(0);
      expect(comparison.deltas.hallucination_rate).toBeGreaterThan(0);
      expect(comparison.regressions.length).toBeGreaterThan(0);
    });
  });

  describe("Stats", () => {
    it("computes vetting stats", () => {
      createVettingReport({
        model_id: "model-a",
        model_name: "A",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });
      createVettingReport({
        model_id: "model-b",
        model_name: "B",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeBadMetrics(),
      });

      const stats = getVettingStats();
      expect(stats.total_reports).toBe(2);
      expect(stats.by_state.passed).toBe(1);
      expect(stats.by_state.failed).toBe(1);
      expect(stats.pass_rate).toBe(0.5);
    });
  });

  describe("Labels", () => {
    it("has German labels for all vetting states", () => {
      const states = ["pending", "in_progress", "passed", "failed", "shadow", "promoted"] as const;
      for (const state of states) {
        expect(VETTING_STATE_LABELS_DE[state]).toBeTruthy();
      }
    });

    it("has German labels for all vetting dimensions", () => {
      const dimensions = [
        "citation_accuracy",
        "hallucination_rate",
        "jurisdiction_contamination",
        "language_quality",
        "latency",
        "cost",
        "guardrail_compatibility",
        "judge_bias",
      ] as const;
      for (const dim of dimensions) {
        expect(VETTING_DIMENSION_LABELS_DE[dim]).toBeTruthy();
      }
    });
  });
});
