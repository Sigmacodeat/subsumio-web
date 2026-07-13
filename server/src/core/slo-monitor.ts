/**
 * EPIC 8 — T8.5 Observability/SLO
 *
 * Collects metrics on success, verified, blocked, verifier error, stale
 * source, retrieval miss, cost, latency. Defines SLOs per core workflow
 * and provides alerting when SLOs are breached.
 *
 * Metrics are collected from:
 *   - Cost Ledger (T8.3) — cost, latency, token usage
 *   - Guardrail Metrics (existing) — tier_0/tier_1 pass rates
 *   - Work Product Receipts (existing) — verification states
 *   - Dead Letter Queue (T8.4) — failed/dead job counts
 */

// ── Types ──────────────────────────────────────────────────────────────

export type WorkflowMetric =
  | "success_rate"
  | "verified_rate"
  | "blocked_rate"
  | "verifier_error_rate"
  | "stale_source_rate"
  | "retrieval_miss_rate"
  | "avg_latency_ms"
  | "avg_cost_usd"
  | "guardrail_pass_rate"
  | "regeneration_rate"
  | "hit_rate";

export type SLOSeverity = "critical" | "warning" | "info";
export type SLOStatus = "met" | "breached" | "no_data";

export interface SLODefinition {
  workflow: string;
  metric: WorkflowMetric;
  target: number;
  window_hours: number;
  severity: SLOSeverity;
  /** For rate metrics: target is a minimum (>=). For error/latency metrics: target is a maximum (<=). */
  direction: "min" | "max";
  description: string;
}

export interface SLOStatusResult {
  workflow: string;
  metric: WorkflowMetric;
  current_value: number;
  target: number;
  status: SLOStatus;
  severity: SLOSeverity;
  window_hours: number;
  direction: "min" | "max";
  description: string;
  breached: boolean;
}

export interface WorkflowMetrics {
  workflow: string;
  total_queries: number;
  successful_queries: number;
  verified_queries: number;
  blocked_queries: number;
  verifier_errors: number;
  stale_sources: number;
  retrieval_misses: number;
  regenerations: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  guardrail_pass_rate: number;
  success_rate: number;
  verified_rate: number;
  blocked_rate: number;
  verifier_error_rate: number;
  stale_source_rate: number;
  retrieval_miss_rate: number;
  regeneration_rate: number;
  avg_cost_usd: number;
  hit_rate: number;
}

// ── SLO Definitions ────────────────────────────────────────────────────

export const SLO_DEFINITIONS: SLODefinition[] = [
  // Think workflow
  {
    workflow: "think",
    metric: "success_rate",
    target: 0.95,
    window_hours: 24,
    severity: "critical",
    direction: "min",
    description: "≥95% of think queries must complete successfully within 24h",
  },
  {
    workflow: "think",
    metric: "verified_rate",
    target: 0.8,
    window_hours: 24,
    severity: "warning",
    direction: "min",
    description: "≥80% of think queries must pass verification within 24h",
  },
  {
    workflow: "think",
    metric: "blocked_rate",
    target: 0.05,
    window_hours: 24,
    severity: "warning",
    direction: "max",
    description: "≤5% of think queries may be blocked within 24h",
  },
  {
    workflow: "think",
    metric: "verifier_error_rate",
    target: 0.02,
    window_hours: 24,
    severity: "critical",
    direction: "max",
    description: "≤2% verifier error rate within 24h",
  },
  {
    workflow: "think",
    metric: "avg_latency_ms",
    target: 30_000,
    window_hours: 24,
    severity: "warning",
    direction: "max",
    description: "Average think latency ≤30s within 24h",
  },
  {
    workflow: "think",
    metric: "avg_cost_usd",
    target: 0.01,
    window_hours: 24,
    severity: "info",
    direction: "max",
    description: "Average cost per think query ≤$0.01 within 24h",
  },
  // Subsumption workflow
  {
    workflow: "subsumption",
    metric: "success_rate",
    target: 0.9,
    window_hours: 24,
    severity: "critical",
    direction: "min",
    description: "≥90% of subsumption queries must complete successfully within 24h",
  },
  {
    workflow: "subsumption",
    metric: "retrieval_miss_rate",
    target: 0.1,
    window_hours: 24,
    severity: "warning",
    direction: "max",
    description: "≤10% retrieval miss rate for subsumption within 24h",
  },
  // Legal pipeline
  {
    workflow: "legal_pipeline",
    metric: "verified_rate",
    target: 0.85,
    window_hours: 24,
    severity: "warning",
    direction: "min",
    description: "≥85% of legal pipeline outputs must be verified within 24h",
  },
  {
    workflow: "legal_pipeline",
    metric: "stale_source_rate",
    target: 0.05,
    window_hours: 24,
    severity: "warning",
    direction: "max",
    description: "≤5% stale source rate for legal pipeline within 24h",
  },
  {
    workflow: "legal_pipeline",
    metric: "guardrail_pass_rate",
    target: 0.9,
    window_hours: 24,
    severity: "critical",
    direction: "min",
    description: "≥90% guardrail pass rate for legal pipeline within 24h",
  },
  // Cross-verify
  {
    workflow: "cross_verify",
    metric: "success_rate",
    target: 0.95,
    window_hours: 24,
    severity: "critical",
    direction: "min",
    description: "≥95% of cross-verify checks must complete successfully within 24h",
  },
  // Retrieval workflow
  {
    workflow: "retrieval",
    metric: "hit_rate",
    target: 0.9,
    window_hours: 24,
    severity: "critical",
    direction: "min",
    description: "≥90% retrieval hit rate (Hit@5) within 24h",
  },
];

// ── Metrics Collection ─────────────────────────────────────────────────

/**
 * In-memory metrics store. In production this would be backed by
 * the cost ledger + guardrail metrics tables.
 */
interface MetricsStore {
  workflows: Map<string, WorkflowMetrics>;
}

const store: MetricsStore = {
  workflows: new Map(),
};

export function _resetMetricsStore(): void {
  store.workflows.clear();
}

/**
 * Record raw metrics for a workflow. Called by the workflow executor
 * after each query/turn completes.
 */
export interface RecordMetricsOpts {
  workflow: string;
  successful: boolean;
  verified: boolean;
  blocked: boolean;
  verifier_error: boolean;
  stale_source: boolean;
  retrieval_miss: boolean;
  regenerated: boolean;
  cost_usd: number;
  latency_ms: number;
  guardrail_passed: boolean;
  retrieval_hit?: boolean;
}

export function recordWorkflowMetrics(opts: RecordMetricsOpts): void {
  let metrics = store.workflows.get(opts.workflow);
  if (!metrics) {
    metrics = {
      workflow: opts.workflow,
      total_queries: 0,
      successful_queries: 0,
      verified_queries: 0,
      blocked_queries: 0,
      verifier_errors: 0,
      stale_sources: 0,
      retrieval_misses: 0,
      regenerations: 0,
      total_cost_usd: 0,
      avg_latency_ms: 0,
      guardrail_pass_rate: 0,
      success_rate: 0,
      verified_rate: 0,
      blocked_rate: 0,
      verifier_error_rate: 0,
      stale_source_rate: 0,
      retrieval_miss_rate: 0,
      regeneration_rate: 0,
      avg_cost_usd: 0,
      hit_rate: 0,
    };
    store.workflows.set(opts.workflow, metrics);
  }

  metrics.total_queries++;
  if (opts.successful) metrics.successful_queries++;
  if (opts.verified) metrics.verified_queries++;
  if (opts.blocked) metrics.blocked_queries++;
  if (opts.verifier_error) metrics.verifier_errors++;
  if (opts.stale_source) metrics.stale_sources++;
  if (opts.retrieval_miss) metrics.retrieval_misses++;
  if (opts.regenerated) metrics.regenerations++;
  metrics.total_cost_usd += opts.cost_usd;

  // Recompute derived metrics
  const t = metrics.total_queries;
  metrics.success_rate = metrics.successful_queries / t;
  metrics.verified_rate = metrics.verified_queries / t;
  metrics.blocked_rate = metrics.blocked_queries / t;
  metrics.verifier_error_rate = metrics.verifier_errors / t;
  metrics.stale_source_rate = metrics.stale_sources / t;
  metrics.retrieval_miss_rate = metrics.retrieval_misses / t;
  metrics.regeneration_rate = metrics.regenerations / t;
  metrics.avg_cost_usd = metrics.total_cost_usd / t;
  // Running average latency
  metrics.avg_latency_ms = Math.round((metrics.avg_latency_ms * (t - 1) + opts.latency_ms) / t);
  // Guardrail pass rate: track as ratio
  const guardrailPassed = opts.guardrail_passed ? 1 : 0;
  metrics.guardrail_pass_rate = (metrics.guardrail_pass_rate * (t - 1) + guardrailPassed) / t;
  // Retrieval hit rate (running average)
  const retrievalHit = opts.retrieval_hit ? 1 : 0;
  metrics.hit_rate = (metrics.hit_rate * (t - 1) + retrievalHit) / t;
}

/**
 * Get current metrics for a workflow.
 */
export function getWorkflowMetrics(workflow: string): WorkflowMetrics | undefined {
  return store.workflows.get(workflow);
}

/**
 * Get all workflow metrics.
 */
export function getAllWorkflowMetrics(): WorkflowMetrics[] {
  return [...store.workflows.values()];
}

// ── SLO Evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate a single SLO against current metrics.
 */
export function evaluateSLO(slo: SLODefinition): SLOStatusResult {
  const metrics = store.workflows.get(slo.workflow);

  if (!metrics || metrics.total_queries === 0) {
    return {
      workflow: slo.workflow,
      metric: slo.metric,
      current_value: 0,
      target: slo.target,
      status: "no_data",
      severity: slo.severity,
      window_hours: slo.window_hours,
      direction: slo.direction,
      description: slo.description,
      breached: false,
    };
  }

  const currentValue = getMetricValue(metrics, slo.metric);
  const breached = slo.direction === "min" ? currentValue < slo.target : currentValue > slo.target;

  return {
    workflow: slo.workflow,
    metric: slo.metric,
    current_value: currentValue,
    target: slo.target,
    status: breached ? "breached" : "met",
    severity: slo.severity,
    window_hours: slo.window_hours,
    direction: slo.direction,
    description: slo.description,
    breached,
  };
}

/**
 * Get the metric value from a WorkflowMetrics object.
 */
export function getMetricValue(metrics: WorkflowMetrics, metric: WorkflowMetric): number {
  switch (metric) {
    case "success_rate":
      return metrics.success_rate;
    case "verified_rate":
      return metrics.verified_rate;
    case "blocked_rate":
      return metrics.blocked_rate;
    case "verifier_error_rate":
      return metrics.verifier_error_rate;
    case "stale_source_rate":
      return metrics.stale_source_rate;
    case "retrieval_miss_rate":
      return metrics.retrieval_miss_rate;
    case "avg_latency_ms":
      return metrics.avg_latency_ms;
    case "avg_cost_usd":
      return metrics.avg_cost_usd;
    case "guardrail_pass_rate":
      return metrics.guardrail_pass_rate;
    case "regeneration_rate":
      return metrics.regeneration_rate;
    case "hit_rate":
      return metrics.hit_rate;
  }
}

/**
 * Evaluate all SLOs and return their statuses.
 */
export function evaluateAllSLOs(): SLOStatusResult[] {
  return SLO_DEFINITIONS.map(evaluateSLO);
}

/**
 * Get only breached SLOs (for alerting).
 */
export function getBreachedSLOs(): SLOStatusResult[] {
  return evaluateAllSLOs().filter((s) => s.breached);
}

/**
 * Get SLOs for a specific workflow.
 */
export function getSLOsForWorkflow(workflow: string): SLOStatusResult[] {
  return SLO_DEFINITIONS.filter((s) => s.workflow === workflow).map(evaluateSLO);
}

// ── Alerting ───────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  slo: SLOStatusResult;
  message: string;
  timestamp: string;
}

/**
 * Generate alerts for breached SLOs.
 * Only critical and warning severity SLOs generate alerts.
 */
export function generateAlerts(): Alert[] {
  const breached = getBreachedSLOs();
  return breached
    .filter((s) => s.severity !== "info")
    .map((s) => ({
      id: `${s.workflow}:${s.metric}`,
      slo: s,
      message:
        `SLO BREACHED: ${s.workflow}.${s.metric} = ${s.current_value.toFixed(4)} ` +
        `(target ${s.direction === "min" ? "≥" : "≤"} ${s.target}, severity: ${s.severity})`,
      timestamp: new Date().toISOString(),
    }));
}

/**
 * Get a summary of all SLO statuses for dashboard display.
 */
export function getSLOSummary(): {
  total: number;
  met: number;
  breached: number;
  no_data: number;
  critical_breaches: number;
  warning_breaches: number;
  alerts: Alert[];
} {
  const all = evaluateAllSLOs();
  const alerts = generateAlerts();
  return {
    total: all.length,
    met: all.filter((s) => s.status === "met").length,
    breached: all.filter((s) => s.status === "breached").length,
    no_data: all.filter((s) => s.status === "no_data").length,
    critical_breaches: all.filter((s) => s.breached && s.severity === "critical").length,
    warning_breaches: all.filter((s) => s.breached && s.severity === "warning").length,
    alerts,
  };
}
