/**
 * LAB-DACH v3 — Scoring & Reporting
 *
 * Computes aggregate scores from RubricResults:
 *   - All-Pass: only if ALL critical criteria pass
 *   - Criterion Pass Rate
 *   - False-Pass-Rate (for LLM judge vs human comparison)
 *   - Cohen's Kappa (judge agreement)
 *   - Per: jurisdiction, legal_area, workflow, difficulty
 *   - Token/cost/latency from receipts
 */

import type {
  RubricResult,
  RunReceipt,
  Task,
  CriterionResult,
  Jurisdiction,
  JudgeStatus,
} from "./types.ts";
import type { VerificationState } from "../../core/verification/states.ts";

// ── Aggregate Score ───────────────────────────────────────────────────

export interface AggregateScore {
  /** Total tasks evaluated */
  total_tasks: number;
  /** All-pass count (all critical criteria passed) */
  all_pass_count: number;
  /** All-pass rate (0-1) */
  all_pass_rate: number;
  /** Strict all-pass count: ALL criteria (critical AND non-critical) passed */
  strict_all_pass_count: number;
  /** Strict all-pass rate (0-1) */
  strict_all_pass_rate: number;
  /** Critical all-pass count (same as all_pass_count for backward compat) */
  critical_all_pass_count: number;
  /** Critical all-pass rate (0-1) */
  critical_all_pass_rate: number;
  /** Total criteria evaluated */
  total_criteria: number;
  /** Criteria passed */
  criteria_passed: number;
  /** Criterion pass rate (0-1) */
  criterion_pass_rate: number;
  /** Critical criteria total */
  critical_total: number;
  /** Critical criteria passed */
  critical_passed: number;
  /** Critical pass rate (0-1) */
  critical_pass_rate: number;
  /** Weighted average score (0-1) */
  weighted_avg_score: number;
  /** Verification state distribution */
  verification_state_distribution: Record<VerificationState, number>;
  /** Judge status distribution (for llm_judge criteria only) */
  judge_status_distribution: Record<JudgeStatus, number>;
  /** Per-jurisdiction breakdown */
  by_jurisdiction: Record<string, JurisdictionBreakdown>;
  /** Per-legal-area breakdown */
  by_legal_area: Record<string, AreaBreakdown>;
  /** Per-workflow breakdown */
  by_workflow: Record<string, WorkflowBreakdown>;
  /** Per-difficulty breakdown */
  by_difficulty: Record<string, DifficultyBreakdown>;
  /** Token/cost/latency aggregates */
  cost_metrics: CostMetrics;
  /** Confidence intervals (Wilson) for key metrics */
  confidence_intervals: ConfidenceIntervals;
}

export interface JurisdictionBreakdown {
  jurisdiction: Jurisdiction;
  total: number;
  all_pass: number;
  criterion_pass_rate: number;
  critical_pass_rate: number;
}

export interface AreaBreakdown {
  legal_area: string;
  total: number;
  all_pass: number;
  criterion_pass_rate: number;
}

export interface WorkflowBreakdown {
  workflow: string;
  total: number;
  all_pass: number;
  criterion_pass_rate: number;
}

export interface DifficultyBreakdown {
  difficulty: string;
  total: number;
  all_pass: number;
  criterion_pass_rate: number;
}

export interface CostMetrics {
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_hits: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  total_latency_ms: number;
}

export interface ConfidenceIntervals {
  /** Wilson CI for strict_all_pass_rate */
  strict_all_pass: WilsonCI;
  /** Wilson CI for critical_all_pass_rate */
  critical_all_pass: WilsonCI;
  /** Wilson CI for criterion_pass_rate */
  criterion_pass: WilsonCI;
}

export interface WilsonCI {
  /** Lower bound (0-1) */
  lower: number;
  /** Upper bound (0-1) */
  upper: number;
  /** Point estimate (0-1) */
  point: number;
  /** Sample size */
  n: number;
  /** Z-score used (default 1.96 for 95% CI) */
  z: number;
}

export interface PrecisionRecall {
  /** Precision for FAIL: of all judge-FAIL, how many are truly FAIL */
  precision: number;
  /** Recall for FAIL: of all truly-FAIL, how many did the judge catch */
  recall: number;
  /** F1 score */
  f1: number;
  /** True positives (judge=FAIL, human=FAIL) */
  tp: number;
  /** False positives (judge=FAIL, human=PASS) */
  fp: number;
  /** False negatives (judge=PASS, human=FAIL) */
  fn: number;
  /** True negatives (judge=PASS, human=PASS) */
  tn: number;
}

// ── Scoring Functions ─────────────────────────────────────────────────

/**
 * Compute aggregate score from rubric results, tasks, and receipts.
 */
export function computeAggregateScore(
  results: RubricResult[],
  tasks: Task[],
  receipts: RunReceipt[]
): AggregateScore {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const receiptMap = new Map(receipts.map((r) => [r.task_id, r]));

  let allPassCount = 0;
  let strictAllPassCount = 0;
  let totalCriteria = 0;
  let criteriaPassed = 0;
  let criticalTotal = 0;
  let criticalPassed = 0;
  let weightedScoreSum = 0;

  const verificationDist: Record<string, number> = {};
  const judgeStatusDist: Record<string, number> = {
    pass: 0,
    fail: 0,
    uncertain: 0,
    not_judgeable: 0,
    judge_error: 0,
  };
  const byJurisdiction: Record<string, JurisdictionBreakdown> = {};
  const byLegalArea: Record<string, AreaBreakdown> = {};
  const byWorkflow: Record<string, WorkflowBreakdown> = {};
  const byDifficulty: Record<string, DifficultyBreakdown> = {};

  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheHits = 0;
  let totalCost = 0;
  let totalLatency = 0;

  for (const result of results) {
    const task = taskMap.get(result.task_id);
    const receipt = receiptMap.get(result.task_id);

    if (result.all_pass) allPassCount++;
    if (result.strict_all_pass) strictAllPassCount++;
    totalCriteria += result.criteria_total;
    criteriaPassed += result.criteria_passed;
    criticalTotal += result.critical_total;
    criticalPassed += result.critical_passed;
    weightedScoreSum += result.weighted_score;

    if (result.verification_state) {
      verificationDist[result.verification_state] =
        (verificationDist[result.verification_state] ?? 0) + 1;
    }

    // Aggregate judge status distribution
    if (result.judge_status_counts) {
      for (const [status, count] of Object.entries(result.judge_status_counts)) {
        judgeStatusDist[status] = (judgeStatusDist[status] ?? 0) + count;
      }
    } else {
      // Fallback: derive from criteria results
      for (const cr of result.criteria) {
        if (cr.judge_status) {
          judgeStatusDist[cr.judge_status] = (judgeStatusDist[cr.judge_status] ?? 0) + 1;
        }
      }
    }

    // Per-jurisdiction
    if (task) {
      const j = task.jurisdiction;
      if (!byJurisdiction[j]) {
        byJurisdiction[j] = {
          jurisdiction: j,
          total: 0,
          all_pass: 0,
          criterion_pass_rate: 0,
          critical_pass_rate: 0,
        };
      }
      byJurisdiction[j]!.total++;
      if (result.all_pass) byJurisdiction[j]!.all_pass++;

      // Per-legal-area
      const area = task.legal_area;
      if (!byLegalArea[area]) {
        byLegalArea[area] = { legal_area: area, total: 0, all_pass: 0, criterion_pass_rate: 0 };
      }
      byLegalArea[area]!.total++;
      if (result.all_pass) byLegalArea[area]!.all_pass++;

      // Per-workflow
      const wf = task.workflow;
      if (!byWorkflow[wf]) {
        byWorkflow[wf] = { workflow: wf, total: 0, all_pass: 0, criterion_pass_rate: 0 };
      }
      byWorkflow[wf]!.total++;
      if (result.all_pass) byWorkflow[wf]!.all_pass++;

      // Per-difficulty
      const diff = task.difficulty;
      if (!byDifficulty[diff]) {
        byDifficulty[diff] = { difficulty: diff, total: 0, all_pass: 0, criterion_pass_rate: 0 };
      }
      byDifficulty[diff]!.total++;
      if (result.all_pass) byDifficulty[diff]!.all_pass++;
    }

    // Cost metrics
    if (receipt) {
      totalTokens += receipt.token_counts.input + receipt.token_counts.output;
      totalInputTokens += receipt.token_counts.input;
      totalOutputTokens += receipt.token_counts.output;
      totalCacheHits += receipt.token_counts.cache_hit ?? 0;
      totalCost += receipt.cost_usd;
      totalLatency += receipt.latency_ms;
    }
  }

  // Compute pass rates for breakdowns
  for (const breakdown of Object.values(byJurisdiction)) {
    breakdown.criterion_pass_rate = breakdown.total > 0 ? breakdown.all_pass / breakdown.total : 0;
    breakdown.critical_pass_rate = breakdown.total > 0 ? breakdown.all_pass / breakdown.total : 0;
  }
  for (const breakdown of Object.values(byLegalArea)) {
    breakdown.criterion_pass_rate = breakdown.total > 0 ? breakdown.all_pass / breakdown.total : 0;
  }
  for (const breakdown of Object.values(byWorkflow)) {
    breakdown.criterion_pass_rate = breakdown.total > 0 ? breakdown.all_pass / breakdown.total : 0;
  }
  for (const breakdown of Object.values(byDifficulty)) {
    breakdown.criterion_pass_rate = breakdown.total > 0 ? breakdown.all_pass / breakdown.total : 0;
  }

  const totalTasks = results.length;
  const strictAllPassRate = totalTasks > 0 ? strictAllPassCount / totalTasks : 0;
  const criticalAllPassRate = totalTasks > 0 ? allPassCount / totalTasks : 0;
  const criterionPassRate = totalCriteria > 0 ? criteriaPassed / totalCriteria : 0;

  return {
    total_tasks: totalTasks,
    all_pass_count: allPassCount,
    all_pass_rate: criticalAllPassRate,
    strict_all_pass_count: strictAllPassCount,
    strict_all_pass_rate: strictAllPassRate,
    critical_all_pass_count: allPassCount,
    critical_all_pass_rate: criticalAllPassRate,
    total_criteria: totalCriteria,
    criteria_passed: criteriaPassed,
    criterion_pass_rate: criterionPassRate,
    critical_total: criticalTotal,
    critical_passed: criticalPassed,
    critical_pass_rate: criticalTotal > 0 ? criticalPassed / criticalTotal : 0,
    weighted_avg_score: totalTasks > 0 ? weightedScoreSum / totalTasks : 0,
    verification_state_distribution: verificationDist as Record<VerificationState, number>,
    judge_status_distribution: judgeStatusDist as Record<JudgeStatus, number>,
    by_jurisdiction: byJurisdiction,
    by_legal_area: byLegalArea,
    by_workflow: byWorkflow,
    by_difficulty: byDifficulty,
    cost_metrics: {
      total_tokens: totalTokens,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cache_hits: totalCacheHits,
      total_cost_usd: totalCost,
      avg_latency_ms: totalTasks > 0 ? totalLatency / totalTasks : 0,
      total_latency_ms: totalLatency,
    },
    confidence_intervals: {
      strict_all_pass: wilsonCI(strictAllPassCount, totalTasks),
      critical_all_pass: wilsonCI(allPassCount, totalTasks),
      criterion_pass: wilsonCI(criteriaPassed, totalCriteria),
    },
  };
}

// ── Wilson Confidence Interval ────────────────────────────────────────

/**
 * Compute Wilson score confidence interval for a proportion.
 *
 * @param successes - Number of successes
 * @param total - Total trials
 * @param z - Z-score (default 1.96 for 95% CI)
 * @returns Wilson CI with lower, upper, point estimate, n, z
 */
export function wilsonCI(successes: number, total: number, z: number = 1.96): WilsonCI {
  if (total === 0) {
    return { lower: 0, upper: 0, point: 0, n: 0, z };
  }
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  return {
    lower: Math.max(0, centre - margin),
    upper: Math.min(1, centre + margin),
    point: p,
    n: total,
    z,
  };
}

// ── Precision / Recall for FAIL ───────────────────────────────────────

/**
 * Compute precision and recall for FAIL predictions.
 *
 * Treats FAIL as the positive class:
 *   - TP: judge says FAIL, human says FAIL (correctly identified failure)
 *   - FP: judge says FAIL, human says PASS (false alarm)
 *   - FN: judge says PASS, human says FAIL (missed failure)
 *   - TN: judge says PASS, human says PASS (correctly identified pass)
 *
 * @param judgeResults - Pass/fail from LLM judge (true=PASS, false=FAIL)
 * @param humanResults - Pass/fail from human reviewer (true=PASS, false=FAIL)
 * @returns Precision, recall, F1, and confusion matrix counts
 */
export function computePrecisionRecallForFail(
  judgeResults: boolean[],
  humanResults: boolean[]
): PrecisionRecall {
  if (judgeResults.length !== humanResults.length || judgeResults.length === 0) {
    return { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0, tn: 0 };
  }

  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;

  for (let i = 0; i < judgeResults.length; i++) {
    const judgeFail = !judgeResults[i];
    const humanFail = !humanResults[i];
    if (judgeFail && humanFail) tp++;
    else if (judgeFail && !humanFail) fp++;
    else if (!judgeFail && humanFail) fn++;
    else tn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { precision, recall, f1, tp, fp, fn, tn };
}

// ── Cohen's Kappa ─────────────────────────────────────────────────────

/**
 * Compute Cohen's Kappa for inter-rater agreement.
 * Used to compare LLM judge vs human judge.
 *
 * @param rater1 - Array of pass/fail (true/false) from rater 1
 * @param rater2 - Array of pass/fail (true/false) from rater 2
 * @returns Kappa value (-1 to 1, where 1 = perfect agreement)
 */
export function cohensKappa(rater1: boolean[], rater2: boolean[]): number {
  if (rater1.length !== rater2.length || rater1.length === 0) return 0;

  const n = rater1.length;
  let bothPass = 0;
  let bothFail = 0;
  let r1Pass = 0;
  let r2Pass = 0;

  for (let i = 0; i < n; i++) {
    if (rater1[i]) r1Pass++;
    if (rater2[i]) r2Pass++;
    if (rater1[i] && rater2[i]) bothPass++;
    if (!rater1[i] && !rater2[i]) bothFail++;
  }

  const po = (bothPass + bothFail) / n;
  const pe = (r1Pass / n) * (r2Pass / n) + ((n - r1Pass) / n) * ((n - r2Pass) / n);

  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}

// ── False-Pass-Rate ───────────────────────────────────────────────────

/**
 * Compute the false-pass-rate: percentage of tasks that the judge passed
 * but the human reviewer failed (or vice versa).
 *
 * @param judgeResults - Pass/fail from LLM judge
 * @param humanResults - Pass/fail from human reviewer
 * @returns { false_pass_rate, false_fail_rate }
 */
export function computeFalseRates(
  judgeResults: boolean[],
  humanResults: boolean[]
): { false_pass_rate: number; false_fail_rate: number } {
  if (judgeResults.length !== humanResults.length || judgeResults.length === 0) {
    return { false_pass_rate: 0, false_fail_rate: 0 };
  }

  const n = judgeResults.length;
  let falsePass = 0;
  let falseFail = 0;

  for (let i = 0; i < n; i++) {
    if (judgeResults[i] && !humanResults[i]) falsePass++;
    if (!judgeResults[i] && humanResults[i]) falseFail++;
  }

  return {
    false_pass_rate: falsePass / n,
    false_fail_rate: falseFail / n,
  };
}

// ── Report Generation ─────────────────────────────────────────────────

/**
 * Generate a human-readable report from aggregate scores.
 */
export function generateReport(score: AggregateScore): string {
  const lines: string[] = [];

  lines.push("=== LAB-DACH v3 Benchmark Report ===");
  lines.push("");
  lines.push(`Total Tasks: ${score.total_tasks}`);
  lines.push(
    `Strict All-Pass: ${score.strict_all_pass_count}/${score.total_tasks} (${(score.strict_all_pass_rate * 100).toFixed(1)}%) [CI: ${(score.confidence_intervals.strict_all_pass.lower * 100).toFixed(1)}%–${(score.confidence_intervals.strict_all_pass.upper * 100).toFixed(1)}%]`
  );
  lines.push(
    `Critical All-Pass: ${score.critical_all_pass_count}/${score.total_tasks} (${(score.critical_all_pass_rate * 100).toFixed(1)}%) [CI: ${(score.confidence_intervals.critical_all_pass.lower * 100).toFixed(1)}%–${(score.confidence_intervals.critical_all_pass.upper * 100).toFixed(1)}%]`
  );
  lines.push(
    `Criterion Pass Rate: ${(score.criterion_pass_rate * 100).toFixed(1)}% [CI: ${(score.confidence_intervals.criterion_pass.lower * 100).toFixed(1)}%–${(score.confidence_intervals.criterion_pass.upper * 100).toFixed(1)}%]`
  );
  lines.push(`Critical Pass Rate: ${(score.critical_pass_rate * 100).toFixed(1)}%`);
  lines.push(`Weighted Avg Score: ${score.weighted_avg_score.toFixed(3)}`);
  lines.push("");

  lines.push("--- Judge Status Distribution ---");
  for (const [status, count] of Object.entries(score.judge_status_distribution)) {
    lines.push(`  ${status}: ${count}`);
  }
  lines.push("");

  lines.push("--- Verification States ---");
  for (const [state, count] of Object.entries(score.verification_state_distribution)) {
    lines.push(`  ${state}: ${count}`);
  }
  lines.push("");

  lines.push("--- By Jurisdiction ---");
  for (const breakdown of Object.values(score.by_jurisdiction)) {
    lines.push(
      `  ${breakdown.jurisdiction}: ${breakdown.all_pass}/${breakdown.total} all-pass (${(breakdown.criterion_pass_rate * 100).toFixed(1)}%)`
    );
  }
  lines.push("");

  lines.push("--- By Legal Area ---");
  for (const breakdown of Object.values(score.by_legal_area)) {
    lines.push(
      `  ${breakdown.legal_area}: ${breakdown.all_pass}/${breakdown.total} (${(breakdown.criterion_pass_rate * 100).toFixed(1)}%)`
    );
  }
  lines.push("");

  lines.push("--- By Workflow ---");
  for (const breakdown of Object.values(score.by_workflow)) {
    lines.push(
      `  ${breakdown.workflow}: ${breakdown.all_pass}/${breakdown.total} (${(breakdown.criterion_pass_rate * 100).toFixed(1)}%)`
    );
  }
  lines.push("");

  lines.push("--- Cost Metrics ---");
  lines.push(`  Total Tokens: ${score.cost_metrics.total_tokens}`);
  lines.push(`  Total Cost: $${score.cost_metrics.total_cost_usd.toFixed(4)}`);
  lines.push(`  Avg Latency: ${(score.cost_metrics.avg_latency_ms / 1000).toFixed(1)}s`);
  lines.push("");

  return lines.join("\n");
}
