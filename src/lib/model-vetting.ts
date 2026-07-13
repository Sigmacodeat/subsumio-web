/**
 * EPIC 9 — T9.3 Model Vetting
 * ============================
 *
 * New models are tested on identical test sets before any production traffic.
 * Vetting covers 8 dimensions:
 *   1. Citation accuracy (§-references grounded in sources)
 *   2. Hallucination rate (fabricated statutes/paragraphs)
 *   3. Jurisdiction contamination (wrong country's laws)
 *   4. Language quality (German output)
 *   5. Latency (response time)
 *   6. Cost (per 1M tokens)
 *   7. Guardrail compatibility (warnings/errors)
 *   8. Judge bias (LLM-as-judge agreement with human baseline)
 *
 * Shadow mode: route a percentage of traffic to the new model,
 * compare outputs side-by-side, measure divergence.
 *
 * Vetting states: pending → in_progress → passed | failed | shadow | promoted
 */

// ── Types ─────────────────────────────────────────────────────────────

export type VettingState = "pending" | "in_progress" | "passed" | "failed" | "shadow" | "promoted";

export type VettingDimension =
  | "citation_accuracy"
  | "hallucination_rate"
  | "jurisdiction_contamination"
  | "language_quality"
  | "latency"
  | "cost"
  | "guardrail_compatibility"
  | "judge_bias";

export interface VettingCheckResult {
  dimension: VettingDimension;
  score: number;
  threshold: number;
  passed: boolean;
  details: string;
  metric_value: number;
  metric_unit: string;
}

export interface ModelVettingReport {
  id: string;
  /** Model identifier (e.g., "openrouter:deepseek/deepseek-chat") */
  model_id: string;
  /** Display name */
  model_name: string;
  /** Baseline model for comparison */
  baseline_model_id: string;
  /** Current vetting state */
  state: VettingState;
  /** When vetting was started */
  started_at: string;
  /** When vetting completed */
  completed_at?: string;
  /** Test set used (e.g., "lab-dach-dev", "lab-dach-holdout") */
  test_set: string;
  /** Number of test cases */
  test_cases_count: number;
  /** Per-dimension results */
  checks: VettingCheckResult[];
  /** Overall pass/fail */
  overall_passed: boolean;
  /** Aggregate metrics */
  metrics: VettingMetrics;
  /** Shadow mode configuration (if in shadow mode) */
  shadow_config?: ShadowModeConfig;
  /** Shadow mode results (if available) */
  shadow_results?: ShadowModeResults;
  /** Reviewer notes */
  notes?: string;
  /** Reviewer ID */
  reviewer_id?: string;
}

export interface VettingMetrics {
  citation_accuracy: number;
  hallucination_rate: number;
  jurisdiction_contamination_rate: number;
  german_language_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  cost_per_1m_input_tokens: number;
  cost_per_1m_output_tokens: number;
  guardrail_pass_rate: number;
  judge_agreement_rate: number;
  judge_bias_score: number;
}

export interface ShadowModeConfig {
  /** Percentage of traffic routed to new model (0-100) */
  traffic_percentage: number;
  /** When shadow mode started */
  started_at: string;
  /** Duration in hours */
  duration_hours: number;
  /** Comparison dimensions */
  compare_dimensions: VettingDimension[];
}

export interface ShadowModeResults {
  /** Total requests sent to new model */
  total_shadow_requests: number;
  /** Total requests sent to baseline model */
  total_baseline_requests: number;
  /** Output divergence rate (0-1) */
  divergence_rate: number;
  /** Citation divergence rate */
  citation_divergence_rate: number;
  /** Latency difference (ms, positive = new model slower) */
  latency_diff_ms: number;
  /** Cost difference (USD per 1000 requests, positive = new model more expensive) */
  cost_diff_per_1k: number;
  /** User satisfaction difference (from feedback, -1 to 1) */
  satisfaction_diff: number;
  /** When shadow mode ended */
  ended_at: string;
  /** Recommendation from shadow mode */
  recommendation: "promote" | "keep_shadow" | "rollback";
}

// ── Thresholds ────────────────────────────────────────────────────────

export interface VettingThresholds {
  min_citation_accuracy: number;
  max_hallucination_rate: number;
  max_jurisdiction_contamination: number;
  min_german_language_rate: number;
  max_avg_latency_ms: number;
  max_p95_latency_ms: number;
  max_cost_per_1m_input: number;
  max_cost_per_1m_output: number;
  min_guardrail_pass_rate: number;
  min_judge_agreement_rate: number;
  max_judge_bias_score: number;
}

export const DEFAULT_THRESHOLDS: VettingThresholds = {
  min_citation_accuracy: 0.85,
  max_hallucination_rate: 0.1,
  max_jurisdiction_contamination: 0.05,
  min_german_language_rate: 0.95,
  max_avg_latency_ms: 15_000,
  max_p95_latency_ms: 30_000,
  max_cost_per_1m_input: 5.0,
  max_cost_per_1m_output: 15.0,
  min_guardrail_pass_rate: 0.9,
  min_judge_agreement_rate: 0.8,
  max_judge_bias_score: 0.15,
};

// ── Labels (German) ───────────────────────────────────────────────────

export const VETTING_STATE_LABELS_DE: Record<VettingState, string> = {
  pending: "Ausstehend",
  in_progress: "In Prüfung",
  passed: "Bestanden",
  failed: "Durchgefallen",
  shadow: "Shadow Mode",
  promoted: "Produktion",
};

export const VETTING_DIMENSION_LABELS_DE: Record<VettingDimension, string> = {
  citation_accuracy: "Zitatsgenauigkeit",
  hallucination_rate: "Halluzinationsrate",
  jurisdiction_contamination: "Rechtsgebiet-Kontamination",
  language_quality: "Sprachqualität",
  latency: "Latenz",
  cost: "Kosten",
  guardrail_compatibility: "Guardrail-Kompatibilität",
  judge_bias: "Judge-Bias",
};

// ── In-Memory Store ───────────────────────────────────────────────────

const reports: ModelVettingReport[] = [];
let reportIdCounter = 0;

function generateReportId(): string {
  reportIdCounter++;
  return `vetting-${Date.now()}-${reportIdCounter.toString().padStart(4, "0")}`;
}

// ── Vetting Evaluation ────────────────────────────────────────────────

/**
 * Evaluate vetting metrics against thresholds.
 * Returns per-dimension check results and overall pass/fail.
 */
export function evaluateVetting(
  metrics: VettingMetrics,
  thresholds: VettingThresholds = DEFAULT_THRESHOLDS
): { checks: VettingCheckResult[]; overall_passed: boolean } {
  const checks: VettingCheckResult[] = [];

  // 1. Citation accuracy (higher is better)
  checks.push({
    dimension: "citation_accuracy",
    score: metrics.citation_accuracy,
    threshold: thresholds.min_citation_accuracy,
    passed: metrics.citation_accuracy >= thresholds.min_citation_accuracy,
    metric_value: metrics.citation_accuracy,
    metric_unit: "ratio",
    details: `Citation accuracy ${(metrics.citation_accuracy * 100).toFixed(1)}% (min: ${(thresholds.min_citation_accuracy * 100).toFixed(1)}%)`,
  });

  // 2. Hallucination rate (lower is better)
  checks.push({
    dimension: "hallucination_rate",
    score: 1 - metrics.hallucination_rate,
    threshold: 1 - thresholds.max_hallucination_rate,
    passed: metrics.hallucination_rate <= thresholds.max_hallucination_rate,
    metric_value: metrics.hallucination_rate,
    metric_unit: "ratio",
    details: `Hallucination rate ${(metrics.hallucination_rate * 100).toFixed(1)}% (max: ${(thresholds.max_hallucination_rate * 100).toFixed(1)}%)`,
  });

  // 3. Jurisdiction contamination (lower is better)
  checks.push({
    dimension: "jurisdiction_contamination",
    score: 1 - metrics.jurisdiction_contamination_rate,
    threshold: 1 - thresholds.max_jurisdiction_contamination,
    passed: metrics.jurisdiction_contamination_rate <= thresholds.max_jurisdiction_contamination,
    metric_value: metrics.jurisdiction_contamination_rate,
    metric_unit: "ratio",
    details: `Jurisdiction contamination ${(metrics.jurisdiction_contamination_rate * 100).toFixed(1)}% (max: ${(thresholds.max_jurisdiction_contamination * 100).toFixed(1)}%)`,
  });

  // 4. Language quality (higher is better)
  checks.push({
    dimension: "language_quality",
    score: metrics.german_language_rate,
    threshold: thresholds.min_german_language_rate,
    passed: metrics.german_language_rate >= thresholds.min_german_language_rate,
    metric_value: metrics.german_language_rate,
    metric_unit: "ratio",
    details: `German language rate ${(metrics.german_language_rate * 100).toFixed(1)}% (min: ${(thresholds.min_german_language_rate * 100).toFixed(1)}%)`,
  });

  // 5. Latency (lower is better)
  checks.push({
    dimension: "latency",
    score: 1 - metrics.avg_latency_ms / thresholds.max_avg_latency_ms,
    threshold: 0,
    passed:
      metrics.avg_latency_ms <= thresholds.max_avg_latency_ms &&
      metrics.p95_latency_ms <= thresholds.max_p95_latency_ms,
    metric_value: metrics.avg_latency_ms,
    metric_unit: "ms",
    details: `Avg latency ${metrics.avg_latency_ms}ms (max: ${thresholds.max_avg_latency_ms}ms), P95: ${metrics.p95_latency_ms}ms (max: ${thresholds.max_p95_latency_ms}ms)`,
  });

  // 6. Cost (lower is better)
  checks.push({
    dimension: "cost",
    score: 1 - metrics.cost_per_1m_input_tokens / thresholds.max_cost_per_1m_input,
    threshold: 0,
    passed:
      metrics.cost_per_1m_input_tokens <= thresholds.max_cost_per_1m_input &&
      metrics.cost_per_1m_output_tokens <= thresholds.max_cost_per_1m_output,
    metric_value: metrics.cost_per_1m_input_tokens,
    metric_unit: "USD/1M",
    details: `Cost $${metrics.cost_per_1m_input_tokens.toFixed(2)}/$${metrics.cost_per_1m_output_tokens.toFixed(2)} per 1M tokens (max: $${thresholds.max_cost_per_1m_input}/$${thresholds.max_cost_per_1m_output})`,
  });

  // 7. Guardrail compatibility (higher is better)
  checks.push({
    dimension: "guardrail_compatibility",
    score: metrics.guardrail_pass_rate,
    threshold: thresholds.min_guardrail_pass_rate,
    passed: metrics.guardrail_pass_rate >= thresholds.min_guardrail_pass_rate,
    metric_value: metrics.guardrail_pass_rate,
    metric_unit: "ratio",
    details: `Guardrail pass rate ${(metrics.guardrail_pass_rate * 100).toFixed(1)}% (min: ${(thresholds.min_guardrail_pass_rate * 100).toFixed(1)}%)`,
  });

  // 8. Judge bias (lower is better)
  checks.push({
    dimension: "judge_bias",
    score: 1 - metrics.judge_bias_score,
    threshold: 1 - thresholds.max_judge_bias_score,
    passed:
      metrics.judge_bias_score <= thresholds.max_judge_bias_score &&
      metrics.judge_agreement_rate >= thresholds.min_judge_agreement_rate,
    metric_value: metrics.judge_bias_score,
    metric_unit: "bias_score",
    details: `Judge agreement ${(metrics.judge_agreement_rate * 100).toFixed(1)}% (min: ${(thresholds.min_judge_agreement_rate * 100).toFixed(1)}%), bias score ${metrics.judge_bias_score.toFixed(3)} (max: ${thresholds.max_judge_bias_score})`,
  });

  const overall_passed = checks.every((c) => c.passed);

  return { checks, overall_passed };
}

// ── Report Management ─────────────────────────────────────────────────

export function createVettingReport(input: {
  model_id: string;
  model_name: string;
  baseline_model_id: string;
  test_set: string;
  test_cases_count: number;
  metrics: VettingMetrics;
  thresholds?: VettingThresholds;
}): ModelVettingReport {
  const { checks, overall_passed } = evaluateVetting(
    input.metrics,
    input.thresholds ?? DEFAULT_THRESHOLDS
  );

  const report: ModelVettingReport = {
    id: generateReportId(),
    model_id: input.model_id,
    model_name: input.model_name,
    baseline_model_id: input.baseline_model_id,
    state: overall_passed ? "passed" : "failed",
    started_at: new Date().toISOString(),
    test_set: input.test_set,
    test_cases_count: input.test_cases_count,
    checks,
    overall_passed,
    metrics: input.metrics,
  };

  reports.push(report);
  return report;
}

export function getVettingReport(id: string): ModelVettingReport | undefined {
  return reports.find((r) => r.id === id);
}

export function getAllVettingReports(): ModelVettingReport[] {
  return [...reports].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function getReportsByModel(modelId: string): ModelVettingReport[] {
  return reports.filter((r) => r.model_id === modelId);
}

// ── Shadow Mode ───────────────────────────────────────────────────────

/**
 * Start shadow mode for a model that passed vetting.
 * Shadow mode routes a percentage of traffic to the new model
 * while keeping the baseline model as primary.
 */
export function startShadowMode(
  reportId: string,
  config: Omit<ShadowModeConfig, "started_at">
): ModelVettingReport {
  const report = reports.find((r) => r.id === reportId);
  if (!report) {
    throw new Error(`Vetting report not found: ${reportId}`);
  }
  if (report.state !== "passed") {
    throw new Error(`Shadow mode requires a passed vetting report (current: ${report.state})`);
  }

  report.state = "shadow";
  report.shadow_config = {
    ...config,
    started_at: new Date().toISOString(),
  };

  return report;
}

/**
 * Complete shadow mode with results and recommendation.
 */
export function completeShadowMode(
  reportId: string,
  results: Omit<ShadowModeResults, "ended_at">
): ModelVettingReport {
  const report = reports.find((r) => r.id === reportId);
  if (!report) {
    throw new Error(`Vetting report not found: ${reportId}`);
  }
  if (report.state !== "shadow") {
    throw new Error(`Report is not in shadow mode (current: ${report.state})`);
  }

  report.shadow_results = {
    ...results,
    ended_at: new Date().toISOString(),
  };

  if (results.recommendation === "promote") {
    report.state = "promoted";
  } else if (results.recommendation === "rollback") {
    report.state = "failed";
  }
  // keep_shadow stays in shadow state

  report.completed_at = new Date().toISOString();
  return report;
}

/**
 * Promote a model from shadow mode to production.
 */
export function promoteModel(
  reportId: string,
  reviewerId: string,
  notes?: string
): ModelVettingReport {
  const report = reports.find((r) => r.id === reportId);
  if (!report) {
    throw new Error(`Vetting report not found: ${reportId}`);
  }
  if (report.state !== "shadow" && report.state !== "passed") {
    throw new Error(`Can only promote from shadow or passed state (current: ${report.state})`);
  }

  report.state = "promoted";
  report.completed_at = new Date().toISOString();
  report.reviewer_id = reviewerId;
  report.notes = notes;
  return report;
}

// ── Comparison ────────────────────────────────────────────────────────

export interface ModelComparison {
  baseline: VettingMetrics;
  candidate: VettingMetrics;
  deltas: {
    citation_accuracy: number;
    hallucination_rate: number;
    jurisdiction_contamination: number;
    german_language_rate: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    cost_per_1m_input: number;
    cost_per_1m_output: number;
    guardrail_pass_rate: number;
    judge_agreement_rate: number;
    judge_bias_score: number;
  };
  improvements: string[];
  regressions: string[];
}

/**
 * Compare two models' metrics side by side.
 */
export function compareModels(
  baseline: VettingMetrics,
  candidate: VettingMetrics
): ModelComparison {
  const deltas = {
    citation_accuracy: candidate.citation_accuracy - baseline.citation_accuracy,
    hallucination_rate: candidate.hallucination_rate - baseline.hallucination_rate,
    jurisdiction_contamination:
      candidate.jurisdiction_contamination_rate - baseline.jurisdiction_contamination_rate,
    german_language_rate: candidate.german_language_rate - baseline.german_language_rate,
    avg_latency_ms: candidate.avg_latency_ms - baseline.avg_latency_ms,
    p95_latency_ms: candidate.p95_latency_ms - baseline.p95_latency_ms,
    cost_per_1m_input: candidate.cost_per_1m_input_tokens - baseline.cost_per_1m_input_tokens,
    cost_per_1m_output: candidate.cost_per_1m_output_tokens - baseline.cost_per_1m_output_tokens,
    guardrail_pass_rate: candidate.guardrail_pass_rate - baseline.guardrail_pass_rate,
    judge_agreement_rate: candidate.judge_agreement_rate - baseline.judge_agreement_rate,
    judge_bias_score: candidate.judge_bias_score - baseline.judge_bias_score,
  };

  const improvements: string[] = [];
  const regressions: string[] = [];

  if (deltas.citation_accuracy > 0)
    improvements.push(`Citation accuracy +${(deltas.citation_accuracy * 100).toFixed(1)}pp`);
  else if (deltas.citation_accuracy < 0)
    regressions.push(`Citation accuracy ${(deltas.citation_accuracy * 100).toFixed(1)}pp`);

  if (deltas.hallucination_rate < 0)
    improvements.push(`Hallucination rate -${(deltas.hallucination_rate * 100).toFixed(1)}pp`);
  else if (deltas.hallucination_rate > 0)
    regressions.push(`Hallucination rate +${(deltas.hallucination_rate * 100).toFixed(1)}pp`);

  if (deltas.avg_latency_ms < 0) improvements.push(`Latency ${deltas.avg_latency_ms}ms faster`);
  else if (deltas.avg_latency_ms > 0) regressions.push(`Latency ${deltas.avg_latency_ms}ms slower`);

  if (deltas.cost_per_1m_input < 0)
    improvements.push(`Input cost $${deltas.cost_per_1m_input.toFixed(2)}/1M cheaper`);
  else if (deltas.cost_per_1m_input > 0)
    regressions.push(`Input cost $${deltas.cost_per_1m_input.toFixed(2)}/1M more expensive`);

  if (deltas.guardrail_pass_rate > 0)
    improvements.push(`Guardrail pass rate +${(deltas.guardrail_pass_rate * 100).toFixed(1)}pp`);
  else if (deltas.guardrail_pass_rate < 0)
    regressions.push(`Guardrail pass rate ${(deltas.guardrail_pass_rate * 100).toFixed(1)}pp`);

  return { baseline, candidate, deltas, improvements, regressions };
}

// ── Stats ─────────────────────────────────────────────────────────────

export interface VettingStats {
  total_reports: number;
  by_state: Record<VettingState, number>;
  pass_rate: number;
  promoted_count: number;
  shadow_count: number;
  avg_vetting_duration_ms: number;
}

export function getVettingStats(): VettingStats {
  const byState: Record<VettingState, number> = {
    pending: 0,
    in_progress: 0,
    passed: 0,
    failed: 0,
    shadow: 0,
    promoted: 0,
  };

  let promoted = 0;
  let shadow = 0;
  let completed = 0;
  let totalDuration = 0;

  for (const report of reports) {
    byState[report.state]++;
    if (report.state === "promoted") promoted++;
    if (report.state === "shadow") shadow++;
    if (report.completed_at) {
      completed++;
      totalDuration +=
        new Date(report.completed_at).getTime() - new Date(report.started_at).getTime();
    }
  }

  const evaluated = byState.passed + byState.failed + byState.promoted;

  return {
    total_reports: reports.length,
    by_state: byState,
    pass_rate: evaluated > 0 ? (byState.passed + byState.promoted) / evaluated : 0,
    promoted_count: promoted,
    shadow_count: shadow,
    avg_vetting_duration_ms: completed > 0 ? totalDuration / completed : 0,
  };
}

// ── Reset (for testing) ───────────────────────────────────────────────

export function _resetVettingStore(): void {
  reports.length = 0;
  reportIdCounter = 0;
}
