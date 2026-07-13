import { describe, it, expect } from "vitest";
import {
  computeAggregateScore,
  cohensKappa,
  computeFalseRates,
  generateReport,
} from "./scoring.ts";
import type { RubricResult, RunReceipt, Task, CriterionResult } from "./types.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeCriterionResult(id: string, passed: boolean, critical: boolean): CriterionResult {
  return {
    criterion_id: id,
    passed,
    details: `Criterion ${id} ${passed ? "passed" : "failed"}`,
    critical,
    score: passed ? 1.0 : 0.0,
  };
}

function makeRubricResult(
  taskId: string,
  opts: {
    allPass?: boolean;
    criteriaPassed?: number;
    criteriaTotal?: number;
    criticalPassed?: number;
    criticalTotal?: number;
    weightedScore?: number;
    verificationState?: string;
  }
): RubricResult {
  const criteriaTotal = opts.criteriaTotal ?? 10;
  const criteriaPassed = opts.criteriaPassed ?? (opts.allPass ? criteriaTotal : 6);
  const criticalTotal = opts.criticalTotal ?? 3;
  const criticalPassed = opts.criticalPassed ?? (opts.allPass ? criticalTotal : 2);

  return {
    task_id: taskId,
    criteria: [],
    all_pass: opts.allPass ?? false,
    criterion_pass_rate: criteriaPassed / criteriaTotal,
    criteria_passed: criteriaPassed,
    criteria_total: criteriaTotal,
    critical_passed: criticalPassed,
    critical_total: criticalTotal,
    weighted_score: opts.weightedScore ?? (opts.allPass ? 1.0 : 0.6),
    verification_state: opts.verificationState as RubricResult["verification_state"],
  };
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    jurisdiction: "DE",
    legal_area: "litigation",
    workflow: "rechtsfrage_memorandum",
    difficulty: "normal",
    split: "test",
    prompt: "Test prompt",
    deliverables: [{ type: "memo", filename: "memo.md", description: "test" }],
    criteria: [],
    ...overrides,
  };
}

function makeReceipt(taskId: string, opts: Partial<RunReceipt> = {}): RunReceipt {
  return {
    run_id: `run-${taskId}`,
    task_id: taskId,
    model_id: "test-model",
    provider: "test",
    prompt_hash: "abc123",
    tool_versions: {},
    token_counts: { input: 1000, output: 500 },
    latency_ms: 5000,
    cost_usd: 0.01,
    started_at: "2024-01-01T00:00:00Z",
    completed_at: "2024-01-01T00:00:05Z",
    ...opts,
  };
}

// ── computeAggregateScore ─────────────────────────────────────────────

describe("computeAggregateScore", () => {
  it("computes scores for empty input", () => {
    const score = computeAggregateScore([], [], []);
    expect(score.total_tasks).toBe(0);
    expect(score.all_pass_rate).toBe(0);
  });

  it("computes all-pass rate correctly", () => {
    const results = [
      makeRubricResult("t1", { allPass: true }),
      makeRubricResult("t2", { allPass: true }),
      makeRubricResult("t3", { allPass: false }),
    ];
    const tasks = results.map((r) => makeTask(r.task_id));
    const score = computeAggregateScore(results, tasks, []);
    expect(score.total_tasks).toBe(3);
    expect(score.all_pass_count).toBe(2);
    expect(score.all_pass_rate).toBeCloseTo(2 / 3);
  });

  it("computes criterion pass rate", () => {
    const results = [
      makeRubricResult("t1", { criteriaPassed: 8, criteriaTotal: 10 }),
      makeRubricResult("t2", { criteriaPassed: 6, criteriaTotal: 10 }),
    ];
    const tasks = results.map((r) => makeTask(r.task_id));
    const score = computeAggregateScore(results, tasks, []);
    expect(score.total_criteria).toBe(20);
    expect(score.criteria_passed).toBe(14);
    expect(score.criterion_pass_rate).toBeCloseTo(14 / 20);
  });

  it("computes critical pass rate", () => {
    const results = [
      makeRubricResult("t1", { criticalPassed: 3, criticalTotal: 3 }),
      makeRubricResult("t2", { criticalPassed: 1, criticalTotal: 3 }),
    ];
    const tasks = results.map((r) => makeTask(r.task_id));
    const score = computeAggregateScore(results, tasks, []);
    expect(score.critical_total).toBe(6);
    expect(score.critical_passed).toBe(4);
    expect(score.critical_pass_rate).toBeCloseTo(4 / 6);
  });

  it("breaks down by jurisdiction", () => {
    const results = [
      makeRubricResult("t1", { allPass: true }),
      makeRubricResult("t2", { allPass: false }),
    ];
    const tasks = [makeTask("t1", { jurisdiction: "DE" }), makeTask("t2", { jurisdiction: "AT" })];
    const score = computeAggregateScore(results, tasks, []);
    expect(score.by_jurisdiction.DE.total).toBe(1);
    expect(score.by_jurisdiction.DE.all_pass).toBe(1);
    expect(score.by_jurisdiction.AT.total).toBe(1);
    expect(score.by_jurisdiction.AT.all_pass).toBe(0);
  });

  it("aggregates cost metrics", () => {
    const results = [makeRubricResult("t1", {}), makeRubricResult("t2", {})];
    const tasks = results.map((r) => makeTask(r.task_id));
    const receipts = [
      makeReceipt("t1", {
        cost_usd: 0.05,
        latency_ms: 3000,
        token_counts: { input: 2000, output: 1000 },
      }),
      makeReceipt("t2", {
        cost_usd: 0.03,
        latency_ms: 7000,
        token_counts: { input: 1500, output: 500 },
      }),
    ];
    const score = computeAggregateScore(results, tasks, receipts);
    expect(score.cost_metrics.total_cost_usd).toBeCloseTo(0.08);
    expect(score.cost_metrics.total_tokens).toBe(5000);
    expect(score.cost_metrics.avg_latency_ms).toBe(5000);
  });
});

// ── cohensKappa ───────────────────────────────────────────────────────

describe("cohensKappa", () => {
  it("returns 1 for perfect agreement", () => {
    expect(cohensKappa([true, true, false, false], [true, true, false, false])).toBe(1);
  });

  it("returns 0 for random agreement", () => {
    const r1 = [true, false, true, false];
    const r2 = [false, true, false, true];
    const kappa = cohensKappa(r1, r2);
    expect(kappa).toBeLessThan(0);
  });

  it("returns positive for good agreement", () => {
    const r1 = [true, true, true, false, true, true];
    const r2 = [true, true, true, false, true, false];
    const kappa = cohensKappa(r1, r2);
    expect(kappa).toBeGreaterThan(0.3);
  });

  it("returns 0 for empty arrays", () => {
    expect(cohensKappa([], [])).toBe(0);
  });
});

// ── computeFalseRates ─────────────────────────────────────────────────

describe("computeFalseRates", () => {
  it("computes false-pass-rate correctly", () => {
    const judge = [true, true, false, false];
    const human = [true, false, false, false];
    const rates = computeFalseRates(judge, human);
    expect(rates.false_pass_rate).toBeCloseTo(1 / 4);
    expect(rates.false_fail_rate).toBe(0);
  });

  it("computes false-fail-rate correctly", () => {
    const judge = [false, true, true, false];
    const human = [true, true, true, false];
    const rates = computeFalseRates(judge, human);
    expect(rates.false_pass_rate).toBe(0);
    expect(rates.false_fail_rate).toBeCloseTo(1 / 4);
  });

  it("returns 0 for perfect agreement", () => {
    const judge = [true, false, true, false];
    const human = [true, false, true, false];
    const rates = computeFalseRates(judge, human);
    expect(rates.false_pass_rate).toBe(0);
    expect(rates.false_fail_rate).toBe(0);
  });
});

// ── generateReport ────────────────────────────────────────────────────

describe("generateReport", () => {
  it("generates a readable report", () => {
    const results = [
      makeRubricResult("t1", { allPass: true }),
      makeRubricResult("t2", { allPass: false }),
    ];
    const tasks = [makeTask("t1", { jurisdiction: "DE" }), makeTask("t2", { jurisdiction: "AT" })];
    const score = computeAggregateScore(results, tasks, []);
    const report = generateReport(score);
    expect(report).toContain("LAB-DACH v3");
    expect(report).toContain("Total Tasks: 2");
    expect(report).toContain("All-Pass: 1/2");
    expect(report).toContain("DE:");
    expect(report).toContain("AT:");
  });
});
