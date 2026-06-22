/**
 * Engine Eval Harness Reuse — P1-BRAIN-013
 * ==========================================
 * Wiederverwendung der bestehenden Engine-Eval-Harnesses als einheitliches
 * Superbrain-Eval-Gate. Statt neue Eval-Infrastruktur zu bauen, werden die
 * vorhandenen Systeme integriert:
 *
 *   1. superbrain-eval.ts — Matter Context Quality (Coverage, Gaps, Permissions)
 *   2. rag-eval.ts — RAG Retrieval Quality (Precision, Recall, MRR, NDCG)
 *   3. release-gate.ts — Regression Detection (Baseline-Vergleich)
 *   4. ai-quality.ts — Citation Verification, Deadline F1, Contract Issue F1
 *   5. retrieval-feedback.ts — User Feedback als Eval-Signal
 *   6. evals/ — Externe Eval-Runner (functional-area-resolver, legal-rag, skillopt)
 *
 * Dieses Modul kapselt alle Eval-Systeme hinter einer einheitlichen API
 * und führt sie zu einem gemeinsamen Gate-Status zusammen.
 */

import type { SuperbrainEvalSummary } from "@/lib/superbrain-eval";
import type { EvalSummary } from "@/lib/rag-eval";
import type { GateStatus } from "@/lib/release-gate";
import type { AIQualityReport } from "@/lib/ai-quality";
import type { FeedbackStats } from "@/lib/retrieval-feedback";

// ── Types ─────────────────────────────────────────────────────────────

export type HarnessId =
  | "superbrain"
  | "rag"
  | "release_gate"
  | "ai_quality"
  | "feedback"
  | "functional_area"
  | "legal_rag"
  | "skillopt_judge"
  | "skillopt_reflect";

export type HarnessStatus = "pass" | "warn" | "fail" | "not_run" | "skipped";

export interface HarnessResult {
  harness_id: HarnessId;
  name: string;
  description: string;
  status: HarnessStatus;
  /** Key metrics from this harness */
  metrics: Record<string, number | string>;
  /** Gate breaches (if any) */
  breaches?: string[];
  /** When this harness was last run */
  last_run?: string;
  /** Duration in ms */
  duration_ms?: number;
}

export interface UnifiedEvalGateResult {
  overall_status: HarnessStatus;
  harnesses: HarnessResult[];
  /** Aggregated key metrics across all harnesses */
  aggregated_metrics: AggregatedMetrics;
  /** Combined breaches from all failing harnesses */
  all_breaches: string[];
  /** Whether the gate passes (overall_status === "pass" or "warn") */
  gate_passed: boolean;
  /** Timestamp of this gate evaluation */
  evaluated_at: string;
  /** Summary text for UI/CLI */
  summary: string;
}

export interface AggregatedMetrics {
  precision?: number;
  recall?: number;
  mrr?: number;
  ndcg?: number;
  citation_verification_rate?: number;
  false_citation_rate?: number;
  unsupported_claim_rate?: number;
  deadline_f1?: number;
  contract_issue_f1?: number;
  coverage_score?: number;
  gap_accuracy?: number;
  satisfaction_rate?: number;
  source_leakage_rate?: number;
  entity_resolution_precision?: number;
  freshness_accuracy?: number;
}

// ── Harness Registry ──────────────────────────────────────────────────

export interface HarnessDefinition {
  id: HarnessId;
  name: string;
  description: string;
  /** Source module/file */
  source: string;
  /** Whether this harness is enabled in the gate */
  enabled: boolean;
  /** Whether this is a blocking gate (fail = overall fail) or advisory (warn) */
  blocking: boolean;
}

export const HARNESS_REGISTRY: HarnessDefinition[] = [
  {
    id: "superbrain",
    name: "Superbrain Eval",
    description:
      "Matter Context Quality — Coverage, Gap Detection, Permission Filtering, Temporal Consistency",
    source: "src/lib/superbrain-eval.ts",
    enabled: true,
    blocking: true,
  },
  {
    id: "rag",
    name: "RAG Eval",
    description: "Retrieval Quality — Precision@K, Recall@K, MRR, NDCG gegen Legal Fixtures",
    source: "src/lib/rag-eval.ts",
    enabled: true,
    blocking: true,
  },
  {
    id: "release_gate",
    name: "Release Gate",
    description: "Regression Detection — Vergleich aktueller Eval vs Baseline mit Schwellenwerten",
    source: "src/lib/release-gate.ts",
    enabled: true,
    blocking: true,
  },
  {
    id: "ai_quality",
    name: "AI Quality",
    description: "Citation Verification, Deadline F1, Contract Issue F1, False Citation Rate",
    source: "src/lib/ai-quality.ts",
    enabled: true,
    blocking: true,
  },
  {
    id: "feedback",
    name: "Retrieval Feedback",
    description: "User Feedback als Eval-Signal — Satisfaction Rate, Problematic Results/Queries",
    source: "src/lib/retrieval-feedback.ts",
    enabled: true,
    blocking: false,
  },
  {
    id: "functional_area",
    name: "Functional Area Resolver",
    description: "Routing-Genauigkeit — ordnet Queries korrekt Functional Areas zu",
    source: "evals/functional-area-resolver/",
    enabled: true,
    blocking: false,
  },
  {
    id: "legal_rag",
    name: "Legal RAG Eval",
    description: "Legal-spezifische RAG-Eval mit juristischen Frage-Antwort-Paaren",
    source: "evals/legal-rag/",
    enabled: true,
    blocking: false,
  },
  {
    id: "skillopt_judge",
    name: "Skill Optimization Judge",
    description: "Bewertet Skill-Routing-Optimierung mit LLM-as-Judge",
    source: "evals/skillopt-judge/",
    enabled: false,
    blocking: false,
  },
  {
    id: "skillopt_reflect",
    name: "Skill Optimization Reflect",
    description: "Self-Reflection Eval für Skill-Routing-Optimierung",
    source: "evals/skillopt-reflect/",
    enabled: false,
    blocking: false,
  },
];

// ── Gate Evaluation ───────────────────────────────────────────────────

export function evaluateGate(
  results: Partial<Record<HarnessId, HarnessResult>>
): UnifiedEvalGateResult {
  const harnesses: HarnessResult[] = [];
  const allBreaches: string[] = [];
  const aggregated: AggregatedMetrics = {};

  for (const def of HARNESS_REGISTRY) {
    if (!def.enabled) {
      harnesses.push({
        harness_id: def.id,
        name: def.name,
        description: def.description,
        status: "skipped",
        metrics: {},
      });
      continue;
    }

    const result = results[def.id];
    if (!result) {
      harnesses.push({
        harness_id: def.id,
        name: def.name,
        description: def.description,
        status: "not_run",
        metrics: {},
      });
      continue;
    }

    harnesses.push(result);

    if (result.breaches && result.breaches.length > 0) {
      allBreaches.push(...result.breaches.map((b) => `[${def.id}] ${b}`));
    }

    // Aggregate metrics
    if (result.metrics) {
      const m = result.metrics;
      if (typeof m.precision === "number") aggregated.precision = m.precision;
      if (typeof m.recall === "number") aggregated.recall = m.recall;
      if (typeof m.mrr === "number") aggregated.mrr = m.mrr;
      if (typeof m.ndcg === "number") aggregated.ndcg = m.ndcg;
      if (typeof m.citation_verification_rate === "number")
        aggregated.citation_verification_rate = m.citation_verification_rate;
      if (typeof m.false_citation_rate === "number")
        aggregated.false_citation_rate = m.false_citation_rate;
      if (typeof m.unsupported_claim_rate === "number")
        aggregated.unsupported_claim_rate = m.unsupported_claim_rate;
      if (typeof m.deadline_f1 === "number") aggregated.deadline_f1 = m.deadline_f1;
      if (typeof m.contract_issue_f1 === "number")
        aggregated.contract_issue_f1 = m.contract_issue_f1;
      if (typeof m.coverage_score === "number") aggregated.coverage_score = m.coverage_score;
      if (typeof m.gap_accuracy === "number") aggregated.gap_accuracy = m.gap_accuracy;
      if (typeof m.satisfaction_rate === "number")
        aggregated.satisfaction_rate = m.satisfaction_rate;
      if (typeof m.source_leakage_rate === "number")
        aggregated.source_leakage_rate = m.source_leakage_rate;
      if (typeof m.entity_resolution_precision === "number")
        aggregated.entity_resolution_precision = m.entity_resolution_precision;
      if (typeof m.freshness_accuracy === "number")
        aggregated.freshness_accuracy = m.freshness_accuracy;
    }
  }

  // Determine overall status
  const blockingResults = harnesses.filter((h) => {
    const def = HARNESS_REGISTRY.find((d) => d.id === h.harness_id);
    return def?.blocking && h.status !== "skipped" && h.status !== "not_run";
  });

  const hasFail = blockingResults.some((h) => h.status === "fail");
  const hasWarn = harnesses.some((h) => h.status === "warn");

  const overallStatus: HarnessStatus = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const summary = buildSummary(overallStatus, harnesses, allBreaches);

  return {
    overall_status: overallStatus,
    harnesses,
    aggregated_metrics: aggregated,
    all_breaches: allBreaches,
    gate_passed: overallStatus !== "fail",
    evaluated_at: new Date().toISOString(),
    summary,
  };
}

function buildSummary(
  status: HarnessStatus,
  harnesses: HarnessResult[],
  breaches: string[]
): string {
  const passed = harnesses.filter((h) => h.status === "pass").length;
  const warned = harnesses.filter((h) => h.status === "warn").length;
  const failed = harnesses.filter((h) => h.status === "fail").length;
  const notRun = harnesses.filter((h) => h.status === "not_run").length;
  const skipped = harnesses.filter((h) => h.status === "skipped").length;

  const parts: string[] = [];
  parts.push(`Gate: ${status.toUpperCase()}`);
  parts.push(
    `${passed} passed, ${warned} warned, ${failed} failed, ${notRun} not run, ${skipped} skipped`
  );

  if (breaches.length > 0) {
    parts.push(`${breaches.length} breach(es):`);
    for (const b of breaches.slice(0, 5)) {
      parts.push(`  - ${b}`);
    }
    if (breaches.length > 5) {
      parts.push(`  ... and ${breaches.length - 5} more`);
    }
  }

  return parts.join("\n");
}

// ── Harness Result Builders ───────────────────────────────────────────

export function buildSuperbrainResult(
  summary: SuperbrainEvalSummary,
  breaches: string[] = []
): HarnessResult {
  const metrics: Record<string, number | string> = {
    avg_coverage_score: summary.avg_coverage_score,
    avg_gap_accuracy: summary.avg_gap_accuracy,
    avg_recall_at_k: summary.avg_recall_at_k,
    avg_entity_resolution_precision: summary.avg_entity_resolution_precision,
    avg_freshness_accuracy: summary.avg_freshness_accuracy,
    avg_source_leakage_rate: summary.avg_source_leakage_rate,
    total_fixtures: summary.total,
    passed_fixtures: summary.passed,
    // Canonical keys for aggregation
    coverage_score: summary.avg_coverage_score,
    gap_accuracy: summary.avg_gap_accuracy,
    entity_resolution_precision: summary.avg_entity_resolution_precision,
    freshness_accuracy: summary.avg_freshness_accuracy,
    source_leakage_rate: summary.avg_source_leakage_rate,
  };

  const hasFail = breaches.length > 0;
  const hasWarn = summary.avg_source_leakage_rate > 0;

  return {
    harness_id: "superbrain",
    name: "Superbrain Eval",
    description: "Matter Context Quality",
    status: hasFail ? "fail" : hasWarn ? "warn" : "pass",
    metrics,
    breaches: breaches.length > 0 ? breaches : undefined,
  };
}

export function buildRagResult(
  summary: EvalSummary,
  thresholds?: { min_precision?: number; min_recall?: number; min_mrr?: number }
): HarnessResult {
  const breaches: string[] = [];
  const metrics: Record<string, number | string> = {
    precision: summary.overallPrecision,
    recall: summary.overallRecall,
    mrr: summary.overallMrr,
    ndcg: summary.overallNdcg ?? 0,
    total_queries: summary.totalQueries,
  };

  if (thresholds?.min_precision && summary.overallPrecision < thresholds.min_precision) {
    breaches.push(`Precision ${summary.overallPrecision.toFixed(3)} < ${thresholds.min_precision}`);
  }
  if (thresholds?.min_recall && summary.overallRecall < thresholds.min_recall) {
    breaches.push(`Recall ${summary.overallRecall.toFixed(3)} < ${thresholds.min_recall}`);
  }
  if (thresholds?.min_mrr && summary.overallMrr < thresholds.min_mrr) {
    breaches.push(`MRR ${summary.overallMrr.toFixed(3)} < ${thresholds.min_mrr}`);
  }

  return {
    harness_id: "rag",
    name: "RAG Eval",
    description: "Retrieval Quality",
    status: breaches.length > 0 ? "fail" : "pass",
    metrics,
    breaches: breaches.length > 0 ? breaches : undefined,
  };
}

export function buildReleaseGateResult(
  gateStatus: GateStatus,
  breaches: string[] = []
): HarnessResult {
  return {
    harness_id: "release_gate",
    name: "Release Gate",
    description: "Regression Detection vs Baseline",
    status: gateStatus === "pass" ? "pass" : gateStatus === "warn" ? "warn" : "fail",
    metrics: {
      gate_status: gateStatus,
    },
    breaches: breaches.length > 0 ? breaches : undefined,
  };
}

export function buildAiQualityResult(
  report: AIQualityReport,
  thresholds?: {
    min_citation_verification?: number;
    max_false_citation?: number;
    min_deadline_f1?: number;
  }
): HarnessResult {
  const breaches: string[] = [];
  const metrics: Record<string, number | string> = {
    citation_verification_rate: report.citation.citation_verification_rate,
    false_citation_rate: report.citation.false_citation_rate,
    unsupported_claim_rate: report.claims.unsupported_claim_rate,
    deadline_f1: report.deadlines?.f1 ?? 0,
    contract_issue_f1: report.contract_issues?.f1 ?? 0,
  };

  if (
    thresholds?.min_citation_verification &&
    report.citation.citation_verification_rate < thresholds.min_citation_verification
  ) {
    breaches.push(
      `Citation verification ${report.citation.citation_verification_rate.toFixed(3)} < ${thresholds.min_citation_verification}`
    );
  }
  if (
    thresholds?.max_false_citation &&
    report.citation.false_citation_rate > thresholds.max_false_citation
  ) {
    breaches.push(
      `False citation rate ${report.citation.false_citation_rate.toFixed(3)} > ${thresholds.max_false_citation}`
    );
  }
  if (thresholds?.min_deadline_f1 && (report.deadlines?.f1 ?? 0) < thresholds.min_deadline_f1) {
    breaches.push(
      `Deadline F1 ${(report.deadlines?.f1 ?? 0).toFixed(3)} < ${thresholds.min_deadline_f1}`
    );
  }

  return {
    harness_id: "ai_quality",
    name: "AI Quality",
    description: "Citation Verification & Deadline/Contract F1",
    status: breaches.length > 0 ? "fail" : "pass",
    metrics,
    breaches: breaches.length > 0 ? breaches : undefined,
  };
}

export function buildFeedbackResult(
  stats: FeedbackStats,
  minSatisfactionRate = 0.5
): HarnessResult {
  const breaches: string[] = [];
  const metrics: Record<string, number | string> = {
    satisfaction_rate: stats.satisfaction_rate,
    total_feedback: stats.total_feedback,
    problematic_results: stats.problematic_results.length,
    problematic_queries: stats.problematic_queries.length,
  };

  if (stats.total_feedback >= 10 && stats.satisfaction_rate < minSatisfactionRate) {
    breaches.push(
      `Satisfaction rate ${stats.satisfaction_rate.toFixed(3)} < ${minSatisfactionRate} (with ${stats.total_feedback} feedbacks)`
    );
  }

  return {
    harness_id: "feedback",
    name: "Retrieval Feedback",
    description: "User Feedback als Eval-Signal",
    status: breaches.length > 0 ? "warn" : "pass",
    metrics,
    breaches: breaches.length > 0 ? breaches : undefined,
  };
}

export function buildExternalHarnessResult(
  harnessId: HarnessId,
  name: string,
  description: string,
  metrics: Record<string, number | string>,
  breaches: string[] = []
): HarnessResult {
  return {
    harness_id: harnessId,
    name,
    description,
    status: breaches.length > 0 ? "warn" : "pass",
    metrics,
    breaches: breaches.length > 0 ? breaches : undefined,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

export function getEnabledHarnesses(): HarnessDefinition[] {
  return HARNESS_REGISTRY.filter((h) => h.enabled);
}

export function getBlockingHarnesses(): HarnessDefinition[] {
  return HARNESS_REGISTRY.filter((h) => h.enabled && h.blocking);
}

export function getHarnessById(id: HarnessId): HarnessDefinition | undefined {
  return HARNESS_REGISTRY.find((h) => h.id === id);
}

export function getHarnessStats() {
  return {
    total: HARNESS_REGISTRY.length,
    enabled: HARNESS_REGISTRY.filter((h) => h.enabled).length,
    blocking: HARNESS_REGISTRY.filter((h) => h.enabled && h.blocking).length,
    advisory: HARNESS_REGISTRY.filter((h) => h.enabled && !h.blocking).length,
    disabled: HARNESS_REGISTRY.filter((h) => !h.enabled).length,
  };
}
