/**
 * Tests for EPIC 8 — T8.5 Observability/SLO
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  SLO_DEFINITIONS,
  recordWorkflowMetrics,
  getWorkflowMetrics,
  getAllWorkflowMetrics,
  evaluateSLO,
  evaluateAllSLOs,
  getBreachedSLOs,
  getSLOsForWorkflow,
  generateAlerts,
  getSLOSummary,
  getMetricValue,
  _resetMetricsStore,
  type RecordMetricsOpts,
} from "./slo-monitor.ts";

const GOOD_METRICS: RecordMetricsOpts = {
  workflow: "think",
  successful: true,
  verified: true,
  blocked: false,
  verifier_error: false,
  stale_source: false,
  retrieval_miss: false,
  regenerated: false,
  cost_usd: 0.005,
  latency_ms: 15000,
  guardrail_passed: true,
};

function recordN(workflow: string, n: number, opts: Partial<RecordMetricsOpts> = {}) {
  for (let i = 0; i < n; i++) {
    recordWorkflowMetrics({ ...GOOD_METRICS, workflow, ...opts });
  }
}

describe("SLO Monitor", () => {
  beforeEach(() => {
    _resetMetricsStore();
  });

  describe("SLO Definitions", () => {
    it("has SLOs for think workflow", () => {
      const thinkSLOs = SLO_DEFINITIONS.filter((s) => s.workflow === "think");
      expect(thinkSLOs.length).toBeGreaterThan(0);
      expect(thinkSLOs.some((s) => s.metric === "success_rate")).toBe(true);
      expect(thinkSLOs.some((s) => s.metric === "verified_rate")).toBe(true);
      expect(thinkSLOs.some((s) => s.metric === "blocked_rate")).toBe(true);
      expect(thinkSLOs.some((s) => s.metric === "verifier_error_rate")).toBe(true);
      expect(thinkSLOs.some((s) => s.metric === "avg_latency_ms")).toBe(true);
      expect(thinkSLOs.some((s) => s.metric === "avg_cost_usd")).toBe(true);
    });

    it("has SLOs for subsumption workflow", () => {
      const subSLOs = SLO_DEFINITIONS.filter((s) => s.workflow === "subsumption");
      expect(subSLOs.length).toBeGreaterThan(0);
      expect(subSLOs.some((s) => s.metric === "success_rate")).toBe(true);
      expect(subSLOs.some((s) => s.metric === "retrieval_miss_rate")).toBe(true);
    });

    it("has SLOs for legal_pipeline workflow", () => {
      const legalSLOs = SLO_DEFINITIONS.filter((s) => s.workflow === "legal_pipeline");
      expect(legalSLOs.length).toBeGreaterThan(0);
      expect(legalSLOs.some((s) => s.metric === "verified_rate")).toBe(true);
      expect(legalSLOs.some((s) => s.metric === "stale_source_rate")).toBe(true);
      expect(legalSLOs.some((s) => s.metric === "guardrail_pass_rate")).toBe(true);
    });

    it("all SLOs have required fields", () => {
      for (const slo of SLO_DEFINITIONS) {
        expect(slo.workflow).toBeTruthy();
        expect(slo.metric).toBeTruthy();
        expect(slo.target).toBeGreaterThan(0);
        expect(slo.window_hours).toBeGreaterThan(0);
        expect(slo.severity).toMatch(/^(critical|warning|info)$/);
        expect(slo.direction).toMatch(/^(min|max)$/);
        expect(slo.description).toBeTruthy();
      }
    });
  });

  describe("recordWorkflowMetrics", () => {
    it("records metrics for a single query", () => {
      recordWorkflowMetrics(GOOD_METRICS);
      const m = getWorkflowMetrics("think")!;
      expect(m.total_queries).toBe(1);
      expect(m.successful_queries).toBe(1);
      expect(m.verified_queries).toBe(1);
      expect(m.success_rate).toBe(1);
      expect(m.verified_rate).toBe(1);
    });

    it("accumulates metrics across queries", () => {
      recordN("think", 10);
      recordN("think", 5, { successful: false, verified: false });
      const m = getWorkflowMetrics("think")!;
      expect(m.total_queries).toBe(15);
      expect(m.successful_queries).toBe(10);
      expect(m.success_rate).toBeCloseTo(10 / 15, 5);
    });

    it("tracks blocked queries", () => {
      recordN("think", 8);
      recordN("think", 2, { blocked: true, successful: false, verified: false });
      const m = getWorkflowMetrics("think")!;
      expect(m.blocked_queries).toBe(2);
      expect(m.blocked_rate).toBe(0.2);
    });

    it("tracks verifier errors", () => {
      recordN("think", 9);
      recordN("think", 1, { verifier_error: true });
      const m = getWorkflowMetrics("think")!;
      expect(m.verifier_errors).toBe(1);
      expect(m.verifier_error_rate).toBe(0.1);
    });

    it("tracks stale sources", () => {
      recordN("think", 8);
      recordN("think", 2, { stale_source: true });
      const m = getWorkflowMetrics("think")!;
      expect(m.stale_sources).toBe(2);
      expect(m.stale_source_rate).toBe(0.2);
    });

    it("tracks retrieval misses", () => {
      recordN("think", 7);
      recordN("think", 3, { retrieval_miss: true });
      const m = getWorkflowMetrics("think")!;
      expect(m.retrieval_misses).toBe(3);
      expect(m.retrieval_miss_rate).toBe(0.3);
    });

    it("tracks regenerations", () => {
      recordN("think", 8);
      recordN("think", 2, { regenerated: true });
      const m = getWorkflowMetrics("think")!;
      expect(m.regenerations).toBe(2);
      expect(m.regeneration_rate).toBe(0.2);
    });

    it("tracks cost", () => {
      recordN("think", 10, { cost_usd: 0.01 });
      const m = getWorkflowMetrics("think")!;
      expect(m.total_cost_usd).toBeCloseTo(0.1, 5);
      expect(m.avg_cost_usd).toBeCloseTo(0.01, 5);
    });

    it("tracks guardrail pass rate", () => {
      recordN("think", 8, { guardrail_passed: true });
      recordN("think", 2, { guardrail_passed: false });
      const m = getWorkflowMetrics("think")!;
      expect(m.guardrail_pass_rate).toBeCloseTo(0.8, 5);
    });
  });

  describe("evaluateSLO", () => {
    it("returns no_data when no metrics exist", () => {
      const slo = SLO_DEFINITIONS.find(
        (s) => s.workflow === "think" && s.metric === "success_rate"
      )!;
      const result = evaluateSLO(slo);
      expect(result.status).toBe("no_data");
      expect(result.breached).toBe(false);
    });

    it("returns met when SLO is satisfied", () => {
      recordN("think", 100); // 100% success rate, ≥95% target
      const slo = SLO_DEFINITIONS.find(
        (s) => s.workflow === "think" && s.metric === "success_rate"
      )!;
      const result = evaluateSLO(slo);
      expect(result.status).toBe("met");
      expect(result.current_value).toBe(1);
      expect(result.breached).toBe(false);
    });

    it("returns breached when SLO is not satisfied", () => {
      recordN("think", 80);
      recordN("think", 20, { successful: false }); // 80% success rate, <95% target
      const slo = SLO_DEFINITIONS.find(
        (s) => s.workflow === "think" && s.metric === "success_rate"
      )!;
      const result = evaluateSLO(slo);
      expect(result.status).toBe("breached");
      expect(result.breached).toBe(true);
    });

    it("evaluates max-direction SLOs correctly", () => {
      recordN("think", 90);
      recordN("think", 10, { blocked: true, successful: false }); // 10% blocked, >5% target
      const slo = SLO_DEFINITIONS.find(
        (s) => s.workflow === "think" && s.metric === "blocked_rate"
      )!;
      const result = evaluateSLO(slo);
      expect(result.status).toBe("breached");
      expect(result.direction).toBe("max");
    });

    it("evaluates latency SLO correctly", () => {
      recordN("think", 10, { latency_ms: 20_000 }); // 20s avg, ≤30s target
      const slo = SLO_DEFINITIONS.find(
        (s) => s.workflow === "think" && s.metric === "avg_latency_ms"
      )!;
      const result = evaluateSLO(slo);
      expect(result.status).toBe("met");
    });

    it("evaluates latency SLO as breached when too high", () => {
      recordN("think", 10, { latency_ms: 40_000 }); // 40s avg, >30s target
      const slo = SLO_DEFINITIONS.find(
        (s) => s.workflow === "think" && s.metric === "avg_latency_ms"
      )!;
      const result = evaluateSLO(slo);
      expect(result.status).toBe("breached");
    });
  });

  describe("evaluateAllSLOs", () => {
    it("evaluates all defined SLOs", () => {
      const results = evaluateAllSLOs();
      expect(results.length).toBe(SLO_DEFINITIONS.length);
    });
  });

  describe("getBreachedSLOs", () => {
    it("returns only breached SLOs", () => {
      recordN("think", 50);
      recordN("think", 50, { successful: false }); // 50% success, <95% target
      const breached = getBreachedSLOs();
      expect(breached.length).toBeGreaterThan(0);
      expect(breached.every((s) => s.breached)).toBe(true);
    });

    it("returns empty when all SLOs are met", () => {
      recordN("think", 100);
      const breached = getBreachedSLOs();
      // Some SLOs might still be breached (e.g., cost if >$0.01)
      // but success_rate should not be breached
      const successBreached = breached.find((s) => s.metric === "success_rate");
      expect(successBreached).toBeUndefined();
    });
  });

  describe("getSLOsForWorkflow", () => {
    it("returns SLOs for a specific workflow", () => {
      recordN("think", 10);
      const thinkSLOs = getSLOsForWorkflow("think");
      expect(thinkSLOs.length).toBeGreaterThan(0);
      expect(thinkSLOs.every((s) => s.workflow === "think")).toBe(true);
    });
  });

  describe("generateAlerts", () => {
    it("generates alerts for critical breaches", () => {
      recordN("think", 50);
      recordN("think", 50, { successful: false });
      const alerts = generateAlerts();
      const successAlert = alerts.find((a) => a.id === "think:success_rate");
      expect(successAlert).toBeDefined();
      expect(successAlert!.message).toContain("SLO BREACHED");
      expect(successAlert!.message).toContain("think.success_rate");
    });

    it("does not generate alerts for info severity", () => {
      recordN("think", 10, { cost_usd: 0.02 }); // >$0.01 target
      const alerts = generateAlerts();
      const costAlert = alerts.find((a) => a.id === "think:avg_cost_usd");
      expect(costAlert).toBeUndefined(); // info severity → no alert
    });

    it("does not generate alerts when SLOs are met", () => {
      recordN("think", 100);
      const alerts = generateAlerts();
      const successAlert = alerts.find((a) => a.id === "think:success_rate");
      expect(successAlert).toBeUndefined();
    });
  });

  describe("getSLOSummary", () => {
    it("provides a summary with counts", () => {
      const summary = getSLOSummary();
      expect(summary.total).toBe(SLO_DEFINITIONS.length);
      expect(summary.met + summary.breached + summary.no_data).toBe(summary.total);
    });

    it("counts critical and warning breaches separately", () => {
      recordN("think", 50);
      recordN("think", 50, { successful: false });
      const summary = getSLOSummary();
      expect(summary.critical_breaches).toBeGreaterThan(0);
    });
  });

  describe("getMetricValue", () => {
    it("returns correct values for each metric type", () => {
      recordN("think", 10);
      const m = getWorkflowMetrics("think")!;
      expect(getMetricValue(m, "success_rate")).toBe(1);
      expect(getMetricValue(m, "verified_rate")).toBe(1);
      expect(getMetricValue(m, "blocked_rate")).toBe(0);
      expect(getMetricValue(m, "verifier_error_rate")).toBe(0);
      expect(getMetricValue(m, "stale_source_rate")).toBe(0);
      expect(getMetricValue(m, "retrieval_miss_rate")).toBe(0);
      expect(getMetricValue(m, "regeneration_rate")).toBe(0);
      expect(getMetricValue(m, "avg_latency_ms")).toBe(15000);
      expect(getMetricValue(m, "avg_cost_usd")).toBeCloseTo(0.005, 5);
      expect(getMetricValue(m, "guardrail_pass_rate")).toBe(1);
    });
  });

  describe("getAllWorkflowMetrics", () => {
    it("returns metrics for all workflows", () => {
      recordN("think", 5);
      recordN("subsumption", 3);
      const all = getAllWorkflowMetrics();
      expect(all.length).toBe(2);
      expect(all.some((m) => m.workflow === "think")).toBe(true);
      expect(all.some((m) => m.workflow === "subsumption")).toBe(true);
    });
  });
});
