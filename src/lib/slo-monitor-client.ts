/**
 * SLO Monitor Client — Next.js-side copy of the SLO monitor logic.
 *
 * The server-side module (server/src/core/slo-monitor.ts) maintains an in-memory
 * metrics store. This client mirrors the SLO definitions and evaluation logic
 * for the Next.js API route. In production with a shared metrics DB, both sides
 * would query the same store.
 */

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
  description: string;
  breached: boolean;
}

export interface Alert {
  workflow: string;
  metric: WorkflowMetric;
  severity: SLOSeverity;
  message: string;
  current_value: number;
  target: number;
}

export const SLO_DEFINITIONS: SLODefinition[] = [
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
  {
    workflow: "cross_verify",
    metric: "success_rate",
    target: 0.95,
    window_hours: 24,
    severity: "critical",
    direction: "min",
    description: "≥95% of cross-verify checks must complete successfully within 24h",
  },
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

export function evaluateAllSLOs(): SLOStatusResult[] {
  return SLO_DEFINITIONS.map(evaluateSLO);
}

export function getSLOsForWorkflow(workflow: string): SLOStatusResult[] {
  return SLO_DEFINITIONS.filter((s) => s.workflow === workflow).map(evaluateSLO);
}

export function getBreachedSLOs(): SLOStatusResult[] {
  return evaluateAllSLOs().filter((s) => s.breached);
}

export function generateAlerts(): Alert[] {
  const breached = getBreachedSLOs();
  return breached
    .filter((s) => s.severity !== "info")
    .map((s) => ({
      workflow: s.workflow,
      metric: s.metric,
      severity: s.severity,
      message: `${s.workflow}.${s.metric}: ${s.description} (current: ${s.current_value}, target: ${s.target})`,
      current_value: s.current_value,
      target: s.target,
    }));
}

export function getSLOSummary(): {
  total: number;
  met: number;
  breached: number;
  no_data: number;
  critical_breaches: number;
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
    alerts,
  };
}

function evaluateSLO(def: SLODefinition): SLOStatusResult {
  // No data available in the Next.js client — all SLOs report no_data
  // In production, this would query the shared metrics store
  return {
    workflow: def.workflow,
    metric: def.metric,
    current_value: 0,
    target: def.target,
    status: "no_data",
    severity: def.severity,
    description: def.description,
    breached: false,
  };
}
