/**
 * Tests for EPIC 9 — T9.4 Fine-Tuning Gate
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateGate,
  createGateRequest,
  approveGate,
  rejectGate,
  reevaluateGate,
  getGateRequest,
  getAllGateRequests,
  getGateRequestsByComponent,
  getGateRequestsByState,
  registerHoldoutHash,
  getRegisteredHoldoutHash,
  verifyHoldoutIntegrity,
  getGateStats,
  DEFAULT_GATE_CONFIG,
  COMPONENT_LABELS_DE,
  GATE_STATE_LABELS_DE,
  _resetGateStore,
  type FineTunableComponent,
  type GateState,
} from "@/lib/fine-tuning-gate";
import { createVettingReport, _resetVettingStore, type VettingMetrics } from "@/lib/model-vetting";

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

function makeValidInput() {
  return {
    component: "reranker" as FineTunableComponent,
    model_id: "openrouter:deepseek/deepseek-chat",
    baseline_vetting_report_id: "vetting-001",
    confirmed_data_count: 25,
    mined_fixture_count: 15,
    holdout_hash: "abc123hash",
    last_recorded_holdout_hash: "abc123hash",
    hyperparameters: {
      learning_rate: 1e-5,
      batch_size: 16,
      epochs: 3,
      warmup_steps: 100,
      weight_decay: 0.01,
    },
    objective: "Improve retrieval ranking for German legal queries",
    requester_id: "researcher-001",
  };
}

describe("Fine-Tuning Gate", () => {
  beforeEach(() => {
    _resetGateStore();
    _resetVettingStore();
  });

  describe("Holdout Hash Registry", () => {
    it("registers and retrieves holdout hash", () => {
      registerHoldoutHash("lab-dach-holdout", "sha256-abc");
      const hash = getRegisteredHoldoutHash("lab-dach-holdout");
      expect(hash).toBe("sha256-abc");
    });

    it("verifies holdout integrity", () => {
      registerHoldoutHash("lab-dach-holdout", "sha256-abc");
      expect(verifyHoldoutIntegrity("lab-dach-holdout", "sha256-abc")).toBe(true);
      expect(verifyHoldoutIntegrity("lab-dach-holdout", "sha256-xyz")).toBe(false);
    });

    it("returns undefined for unregistered test set", () => {
      expect(getRegisteredHoldoutHash("unknown")).toBeUndefined();
    });
  });

  describe("Gate Evaluation", () => {
    it("passes with all criteria met", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const evaluation = evaluateGate(makeValidInput(), DEFAULT_GATE_CONFIG, vettingReport);
      expect(evaluation.gate_passed).toBe(true);
      expect(evaluation.has_baseline).toBe(true);
      expect(evaluation.has_sufficient_data).toBe(true);
      expect(evaluation.holdout_unchanged).toBe(true);
      expect(evaluation.component_in_priority).toBe(true);
      expect(evaluation.hyperparameters_safe).toBe(true);
      expect(evaluation.blocking_reasons).toHaveLength(0);
    });

    it("fails without baseline vetting report", () => {
      const evaluation = evaluateGate(makeValidInput(), DEFAULT_GATE_CONFIG, undefined);
      expect(evaluation.gate_passed).toBe(false);
      expect(evaluation.has_baseline).toBe(false);
      expect(evaluation.blocking_reasons).toContain("No baseline vetting report provided");
    });

    it("fails with insufficient confirmed data", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const input = makeValidInput();
      input.confirmed_data_count = 5;
      input.mined_fixture_count = 2;

      const evaluation = evaluateGate(input, DEFAULT_GATE_CONFIG, vettingReport);
      expect(evaluation.gate_passed).toBe(false);
      expect(evaluation.has_sufficient_data).toBe(false);
      expect(
        evaluation.blocking_reasons.some((r) => r.includes("Insufficient confirmed data"))
      ).toBe(true);
      expect(
        evaluation.blocking_reasons.some((r) => r.includes("Insufficient mined fixtures"))
      ).toBe(true);
    });

    it("fails with changed holdout", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const input = makeValidInput();
      input.holdout_hash = "different-hash";

      const evaluation = evaluateGate(input, DEFAULT_GATE_CONFIG, vettingReport);
      expect(evaluation.gate_passed).toBe(false);
      expect(evaluation.holdout_unchanged).toBe(false);
      expect(evaluation.blocking_reasons.some((r) => r.includes("Holdout set has changed"))).toBe(
        true
      );
    });

    it("fails with unsafe hyperparameters", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const input = makeValidInput();
      input.hyperparameters.learning_rate = 0.1; // Way too high

      const evaluation = evaluateGate(input, DEFAULT_GATE_CONFIG, vettingReport);
      expect(evaluation.gate_passed).toBe(false);
      expect(evaluation.hyperparameters_safe).toBe(false);
      expect(evaluation.blocking_reasons.some((r) => r.includes("learning_rate"))).toBe(true);
    });

    it("warns about aggressive learning rate", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const input = makeValidInput();
      input.hyperparameters.learning_rate = 5e-4; // Above 1e-4 warning threshold

      const evaluation = evaluateGate(input, DEFAULT_GATE_CONFIG, vettingReport);
      expect(evaluation.warnings.some((w) => w.includes("Learning rate"))).toBe(true);
    });

    it("warns about low data count", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const input = makeValidInput();
      input.confirmed_data_count = 22; // Just above min (20)

      const evaluation = evaluateGate(input, DEFAULT_GATE_CONFIG, vettingReport);
      expect(evaluation.warnings.some((w) => w.includes("barely above minimum"))).toBe(true);
    });
  });

  describe("Request Management", () => {
    it("creates a reviewable request when all criteria pass", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, vettingReport);
      expect(request.id).toMatch(/^ft-gate-/);
      expect(request.gate_state).toBe("reviewable");
      expect(request.evaluation?.gate_passed).toBe(true);
    });

    it("creates a locked request when criteria fail", () => {
      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, undefined);
      expect(request.gate_state).toBe("locked");
      expect(request.evaluation?.gate_passed).toBe(false);
    });

    it("approves a reviewable request", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, vettingReport);
      const approved = approveGate(request.id, "reviewer-001", "Looks good");

      expect(approved.gate_state).toBe("approved");
      expect(approved.reviewer_id).toBe("reviewer-001");
      expect(approved.review_notes).toBe("Looks good");
    });

    it("throws when approving a locked request", () => {
      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, undefined);
      expect(() => approveGate(request.id, "reviewer-001")).toThrow(/Cannot approve/);
    });

    it("rejects a locked request", () => {
      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, undefined);
      const rejected = rejectGate(request.id, "reviewer-001", "Insufficient data");

      expect(rejected.gate_state).toBe("rejected");
      expect(rejected.review_notes).toBe("Insufficient data");
    });

    it("throws when rejecting an already approved request", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, vettingReport);
      approveGate(request.id, "reviewer-001");
      expect(() => rejectGate(request.id, "reviewer-001")).toThrow(/Cannot reject/);
    });
  });

  describe("Re-evaluate Gate", () => {
    it("re-evaluates after fixing blocking issues", () => {
      // First request with no vetting report → locked
      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, undefined);
      expect(request.gate_state).toBe("locked");

      // Now provide a vetting report
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const reevaluated = reevaluateGate(request.id, {}, DEFAULT_GATE_CONFIG, vettingReport);
      expect(reevaluated.gate_state).toBe("reviewable");
      expect(reevaluated.evaluation?.gate_passed).toBe(true);
    });

    it("throws when re-evaluating approved request", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, vettingReport);
      approveGate(request.id, "reviewer-001");

      expect(() => reevaluateGate(request.id, {}, DEFAULT_GATE_CONFIG, vettingReport)).toThrow(
        /Cannot re-evaluate/
      );
    });
  });

  describe("Query Functions", () => {
    it("gets request by id", () => {
      const request = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, undefined);
      const found = getGateRequest(request.id);
      expect(found).toBeDefined();
    });

    it("gets all requests", () => {
      createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, undefined);
      createGateRequest(
        { ...makeValidInput(), model_id: "model-2" },
        DEFAULT_GATE_CONFIG,
        undefined
      );
      expect(getAllGateRequests()).toHaveLength(2);
    });

    it("filters by component", () => {
      createGateRequest(
        { ...makeValidInput(), component: "reranker" },
        DEFAULT_GATE_CONFIG,
        undefined
      );
      createGateRequest(
        { ...makeValidInput(), component: "classifier" },
        DEFAULT_GATE_CONFIG,
        undefined
      );
      const rerankers = getGateRequestsByComponent("reranker");
      expect(rerankers).toHaveLength(1);
    });

    it("filters by state", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, vettingReport); // reviewable
      createGateRequest({ ...makeValidInput(), model_id: "m2" }, DEFAULT_GATE_CONFIG, undefined); // locked

      const reviewable = getGateRequestsByState("reviewable");
      const locked = getGateRequestsByState("locked");
      expect(reviewable).toHaveLength(1);
      expect(locked).toHaveLength(1);
    });
  });

  describe("Stats", () => {
    it("computes gate stats", () => {
      const vettingReport = createVettingReport({
        model_id: "test-model",
        model_name: "Test",
        baseline_model_id: "baseline",
        test_set: "test",
        test_cases_count: 50,
        metrics: makeGoodMetrics(),
      });

      const r1 = createGateRequest(makeValidInput(), DEFAULT_GATE_CONFIG, vettingReport);
      approveGate(r1.id, "rev-001");

      const r2 = createGateRequest(
        { ...makeValidInput(), model_id: "m2" },
        DEFAULT_GATE_CONFIG,
        undefined
      );
      rejectGate(r2.id, "rev-001");

      const stats = getGateStats();
      expect(stats.total_requests).toBe(2);
      expect(stats.by_state.approved).toBe(1);
      expect(stats.by_state.rejected).toBe(1);
      expect(stats.approval_rate).toBe(0.5);
      expect(stats.rejection_rate).toBe(0.5);
    });
  });

  describe("Labels", () => {
    it("has German labels for all components", () => {
      const components: FineTunableComponent[] = [
        "reranker",
        "classifier",
        "citation_parser",
        "rubric_judge",
      ];
      for (const comp of components) {
        expect(COMPONENT_LABELS_DE[comp]).toBeTruthy();
      }
    });

    it("has German labels for all gate states", () => {
      const states: GateState[] = ["locked", "reviewable", "approved", "rejected"];
      for (const state of states) {
        expect(GATE_STATE_LABELS_DE[state]).toBeTruthy();
      }
    });
  });
});
