import { describe, it, expect } from "vitest";
import {
  computeAggregateScore,
  cohensKappa,
  computeFalseRates,
  computePrecisionRecallForFail,
  wilsonCI,
  generateReport,
} from "./scoring.ts";
import type { RubricResult, RunReceipt, Task, CriterionResult, JudgeStatus } from "./types.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeCriterionResult(
  id: string,
  passed: boolean,
  critical: boolean,
  judgeStatus?: JudgeStatus
): CriterionResult {
  return {
    criterion_id: id,
    passed,
    details: `Criterion ${id} ${passed ? "passed" : "failed"}`,
    critical,
    score: passed ? 1.0 : 0.0,
    judge_status: judgeStatus,
  };
}

function makeRubricResult(
  taskId: string,
  opts: {
    allPass?: boolean;
    strictAllPass?: boolean;
    criteriaPassed?: number;
    criteriaTotal?: number;
    criticalPassed?: number;
    criticalTotal?: number;
    weightedScore?: number;
    verificationState?: string;
    judgeStatusCounts?: Record<JudgeStatus, number>;
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
    strict_all_pass: opts.strictAllPass ?? opts.allPass ?? false,
    critical_all_pass: opts.allPass ?? false,
    criterion_pass_rate: criteriaPassed / criteriaTotal,
    criteria_passed: criteriaPassed,
    criteria_total: criteriaTotal,
    critical_passed: criticalPassed,
    critical_total: criticalTotal,
    weighted_score: opts.weightedScore ?? (opts.allPass ? 1.0 : 0.6),
    verification_state: opts.verificationState as RubricResult["verification_state"],
    judge_status_counts: opts.judgeStatusCounts ?? {
      pass: 0,
      fail: 0,
      uncertain: 0,
      not_judgeable: 0,
      judge_error: 0,
    },
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

  it("computes strict_all_pass correctly", () => {
    const results = [
      makeRubricResult("t1", { allPass: true, strictAllPass: true }),
      makeRubricResult("t2", { allPass: true, strictAllPass: false }),
      makeRubricResult("t3", { allPass: false, strictAllPass: false }),
    ];
    const tasks = results.map((r) => makeTask(r.task_id));
    const score = computeAggregateScore(results, tasks, []);
    expect(score.strict_all_pass_count).toBe(1);
    expect(score.strict_all_pass_rate).toBeCloseTo(1 / 3);
    expect(score.critical_all_pass_count).toBe(2);
    expect(score.critical_all_pass_rate).toBeCloseTo(2 / 3);
  });

  it("aggregates judge_status_distribution", () => {
    const results = [
      makeRubricResult("t1", {
        allPass: true,
        judgeStatusCounts: { pass: 3, fail: 0, uncertain: 1, not_judgeable: 0, judge_error: 0 },
      }),
      makeRubricResult("t2", {
        allPass: false,
        judgeStatusCounts: { pass: 1, fail: 2, uncertain: 0, not_judgeable: 1, judge_error: 1 },
      }),
    ];
    const tasks = results.map((r) => makeTask(r.task_id));
    const score = computeAggregateScore(results, tasks, []);
    expect(score.judge_status_distribution.pass).toBe(4);
    expect(score.judge_status_distribution.fail).toBe(2);
    expect(score.judge_status_distribution.uncertain).toBe(1);
    expect(score.judge_status_distribution.not_judgeable).toBe(1);
    expect(score.judge_status_distribution.judge_error).toBe(1);
  });

  it("computes confidence intervals", () => {
    const results = [
      makeRubricResult("t1", { allPass: true, strictAllPass: true }),
      makeRubricResult("t2", { allPass: true, strictAllPass: true }),
    ];
    const tasks = results.map((r) => makeTask(r.task_id));
    const score = computeAggregateScore(results, tasks, []);
    expect(score.confidence_intervals.strict_all_pass.point).toBe(1);
    expect(score.confidence_intervals.strict_all_pass.lower).toBeGreaterThan(0);
    expect(score.confidence_intervals.strict_all_pass.upper).toBeLessThanOrEqual(1);
    expect(score.confidence_intervals.strict_all_pass.n).toBe(2);
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

// ── wilsonCI ──────────────────────────────────────────────────────────

describe("wilsonCI", () => {
  it("returns zeros for n=0", () => {
    const ci = wilsonCI(0, 0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
    expect(ci.point).toBe(0);
    expect(ci.n).toBe(0);
  });

  it("returns [0,1] for 0 successes out of 1", () => {
    const ci = wilsonCI(0, 1);
    expect(ci.point).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
    expect(ci.upper).toBeLessThan(1);
  });

  it("returns narrow CI for large sample with 50% success", () => {
    const ci = wilsonCI(50, 100);
    expect(ci.point).toBeCloseTo(0.5);
    expect(ci.lower).toBeGreaterThan(0.3);
    expect(ci.upper).toBeLessThan(0.7);
    expect(ci.n).toBe(100);
  });

  it("returns CI that contains the point estimate", () => {
    const ci = wilsonCI(7, 10);
    expect(ci.lower).toBeLessThanOrEqual(ci.point);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.point);
  });
});

// ── computePrecisionRecallForFail ─────────────────────────────────────

describe("computePrecisionRecallForFail", () => {
  it("computes precision and recall for FAIL correctly", () => {
    const judge = [false, false, true, true];
    const human = [false, true, false, true];
    const result = computePrecisionRecallForFail(judge, human);
    expect(result.tp).toBe(1);
    expect(result.fp).toBe(1);
    expect(result.fn).toBe(1);
    expect(result.tn).toBe(1);
    expect(result.precision).toBeCloseTo(0.5);
    expect(result.recall).toBeCloseTo(0.5);
    expect(result.f1).toBeCloseTo(0.5);
  });

  it("returns perfect scores when judge matches human", () => {
    const judge = [false, true, false, true];
    const human = [false, true, false, true];
    const result = computePrecisionRecallForFail(judge, human);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  it("returns zeros for empty arrays", () => {
    const result = computePrecisionRecallForFail([], []);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it("handles all-pass (no FAILs) correctly", () => {
    const judge = [true, true, true];
    const human = [true, true, true];
    const result = computePrecisionRecallForFail(judge, human);
    expect(result.tp).toBe(0);
    expect(result.fp).toBe(0);
    expect(result.fn).toBe(0);
    expect(result.tn).toBe(3);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
  });
});

// ── generateReport ────────────────────────────────────────────────────

describe("generateReport", () => {
  it("generates a readable report with new metrics", () => {
    const results = [
      makeRubricResult("t1", { allPass: true, strictAllPass: true }),
      makeRubricResult("t2", { allPass: false, strictAllPass: false }),
    ];
    const tasks = [makeTask("t1", { jurisdiction: "DE" }), makeTask("t2", { jurisdiction: "AT" })];
    const score = computeAggregateScore(results, tasks, []);
    const report = generateReport(score);
    expect(report).toContain("LAB-DACH v3");
    expect(report).toContain("Total Tasks: 2");
    expect(report).toContain("Strict All-Pass");
    expect(report).toContain("Critical All-Pass");
    expect(report).toContain("CI:");
    expect(report).toContain("Judge Status Distribution");
    expect(report).toContain("DE:");
    expect(report).toContain("AT:");
  });
});
