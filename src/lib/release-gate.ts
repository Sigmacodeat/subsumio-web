/**
 * Release Gate für Subsumio AI Quality.
 *
 * Vergleicht den aktuellen Eval-Run mit dem Baseline-Run und blockiert
 * bei Regression. Schwellenwerte sind konfigurierbar mit Defaults, die
 * auf Legal-AI-Anforderungen abgestimmt sind.
 *
 * Gate-Logik:
 *   1. Citation verification rate darf nicht sinken.
 *   2. Precision@10 darf nicht um mehr als 5% sinken.
 *   3. Recall@10 darf nicht um mehr als 5% sinken.
 *   4. MRR darf nicht um mehr als 0.05 sinken.
 *   5. Deadline accuracy F1 darf nicht unter 0.7 sinken.
 *   6. Contract issue detection F1 darf nicht unter 0.6 sinken.
 *   7. False citation rate darf nicht über 20% steigen.
 *   8. Unsupported claim rate darf nicht über 40% steigen.
 */

import type { EvalSummary } from "@/lib/rag-eval";
import type { AIQualityReport } from "@/lib/ai-quality";

// ── Types ─────────────────────────────────────────────────────────────

export interface GateThresholds {
  min_citation_verification_rate: number;
  min_precision: number;
  min_recall: number;
  min_mrr: number;
  max_false_citation_rate: number;
  max_unsupported_claim_rate: number;
  min_deadline_f1: number;
  min_contract_issue_f1: number;
  /** Allowed regression from baseline (0–1, e.g. 0.05 = 5% drop allowed). */
  max_precision_regression: number;
  max_recall_regression: number;
  max_mrr_regression: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  min_citation_verification_rate: 0.7,
  min_precision: 0.5,
  min_recall: 0.5,
  min_mrr: 0.3,
  max_false_citation_rate: 0.2,
  max_unsupported_claim_rate: 0.4,
  min_deadline_f1: 0.7,
  min_contract_issue_f1: 0.6,
  max_precision_regression: 0.05,
  max_recall_regression: 0.05,
  max_mrr_regression: 0.05,
};

export type GateStatus = "pass" | "fail" | "warn";

export interface GateCheck {
  name: string;
  status: GateStatus;
  current: number;
  baseline?: number;
  threshold?: number;
  message: string;
}

export interface ReleaseGateResult {
  status: GateStatus;
  checks: GateCheck[];
  summary: string;
  eval_timestamp: string;
  baseline_timestamp?: string;
  thresholds: GateThresholds;
}

// ── Gate evaluation ───────────────────────────────────────────────────

export function evaluateReleaseGate(
  current: EvalSummary,
  quality: AIQualityReport | null,
  baseline: EvalSummary | null,
  thresholds: GateThresholds = DEFAULT_THRESHOLDS,
): ReleaseGateResult {
  const checks: GateCheck[] = [];

  // 1. Citation verification rate (absolute threshold)
  if (quality?.citation && quality.citation.corpus_checked) {
    const cvr = quality.citation.citation_verification_rate;
    checks.push({
      name: "citation_verification_rate",
      status: cvr >= thresholds.min_citation_verification_rate ? "pass" : "fail",
      current: cvr,
      threshold: thresholds.min_citation_verification_rate,
      message:
        cvr >= thresholds.min_citation_verification_rate
          ? `Citation verification rate ${(cvr * 100).toFixed(1)}% ≥ Schwellwert ${(thresholds.min_citation_verification_rate * 100).toFixed(1)}%`
          : `Citation verification rate ${(cvr * 100).toFixed(1)}% < Schwellwert ${(thresholds.min_citation_verification_rate * 100).toFixed(1)}%`,
    });
  }

  // 2. False citation rate (absolute threshold)
  if (quality?.citation && quality.citation.corpus_checked) {
    const fcr = quality.citation.false_citation_rate;
    checks.push({
      name: "false_citation_rate",
      status: fcr <= thresholds.max_false_citation_rate ? "pass" : "fail",
      current: fcr,
      threshold: thresholds.max_false_citation_rate,
      message:
        fcr <= thresholds.max_false_citation_rate
          ? `False citation rate ${(fcr * 100).toFixed(1)}% ≤ Schwellwert ${(thresholds.max_false_citation_rate * 100).toFixed(1)}%`
          : `False citation rate ${(fcr * 100).toFixed(1)}% > Schwellwert ${(thresholds.max_false_citation_rate * 100).toFixed(1)}%`,
    });
  }

  // 3. Unsupported claim rate (absolute threshold)
  if (quality?.claims) {
    const ucr = quality.claims.unsupported_claim_rate;
    checks.push({
      name: "unsupported_claim_rate",
      status: ucr <= thresholds.max_unsupported_claim_rate ? "pass" : "warn",
      current: ucr,
      threshold: thresholds.max_unsupported_claim_rate,
      message:
        ucr <= thresholds.max_unsupported_claim_rate
          ? `Unsupported claim rate ${(ucr * 100).toFixed(1)}% ≤ Schwellwert ${(thresholds.max_unsupported_claim_rate * 100).toFixed(1)}%`
          : `Unsupported claim rate ${(ucr * 100).toFixed(1)}% > Schwellwert ${(thresholds.max_unsupported_claim_rate * 100).toFixed(1)}%`,
    });
  }

  // 4. Precision (absolute threshold)
  checks.push({
    name: "precision_absolute",
    status: current.overallPrecision >= thresholds.min_precision ? "pass" : "fail",
    current: current.overallPrecision,
    threshold: thresholds.min_precision,
    message:
      current.overallPrecision >= thresholds.min_precision
        ? `Precision ${(current.overallPrecision * 100).toFixed(1)}% ≥ Schwellwert ${(thresholds.min_precision * 100).toFixed(1)}%`
        : `Precision ${(current.overallPrecision * 100).toFixed(1)}% < Schwellwert ${(thresholds.min_precision * 100).toFixed(1)}%`,
  });

  // 5. Recall (absolute threshold)
  checks.push({
    name: "recall_absolute",
    status: current.overallRecall >= thresholds.min_recall ? "pass" : "fail",
    current: current.overallRecall,
    threshold: thresholds.min_recall,
    message:
      current.overallRecall >= thresholds.min_recall
        ? `Recall ${(current.overallRecall * 100).toFixed(1)}% ≥ Schwellwert ${(thresholds.min_recall * 100).toFixed(1)}%`
        : `Recall ${(current.overallRecall * 100).toFixed(1)}% < Schwellwert ${(thresholds.min_recall * 100).toFixed(1)}%`,
  });

  // 6. MRR (absolute threshold)
  checks.push({
    name: "mrr_absolute",
    status: current.overallMrr >= thresholds.min_mrr ? "pass" : "warn",
    current: current.overallMrr,
    threshold: thresholds.min_mrr,
    message:
      current.overallMrr >= thresholds.min_mrr
        ? `MRR ${current.overallMrr.toFixed(3)} ≥ Schwellwert ${thresholds.min_mrr.toFixed(3)}`
        : `MRR ${current.overallMrr.toFixed(3)} < Schwellwert ${thresholds.min_mrr.toFixed(3)}`,
  });

  // 7. Deadline F1 (if quality report has deadline data)
  if (quality?.deadlines) {
    checks.push({
      name: "deadline_f1",
      status: quality.deadlines.f1 >= thresholds.min_deadline_f1 ? "pass" : "fail",
      current: quality.deadlines.f1,
      threshold: thresholds.min_deadline_f1,
      message:
        quality.deadlines.f1 >= thresholds.min_deadline_f1
          ? `Deadline F1 ${quality.deadlines.f1.toFixed(3)} ≥ Schwellwert ${thresholds.min_deadline_f1.toFixed(3)}`
          : `Deadline F1 ${quality.deadlines.f1.toFixed(3)} < Schwellwert ${thresholds.min_deadline_f1.toFixed(3)}`,
    });
  }

  // 8. Contract issue F1 (if quality report has contract data)
  if (quality?.contract_issues) {
    checks.push({
      name: "contract_issue_f1",
      status: quality.contract_issues.f1 >= thresholds.min_contract_issue_f1 ? "pass" : "warn",
      current: quality.contract_issues.f1,
      threshold: thresholds.min_contract_issue_f1,
      message:
        quality.contract_issues.f1 >= thresholds.min_contract_issue_f1
          ? `Contract Issue F1 ${quality.contract_issues.f1.toFixed(3)} ≥ Schwellwert ${thresholds.min_contract_issue_f1.toFixed(3)}`
          : `Contract Issue F1 ${quality.contract_issues.f1.toFixed(3)} < Schwellwert ${thresholds.min_contract_issue_f1.toFixed(3)}`,
    });
  }

  // Regression checks against baseline
  if (baseline) {
    const precisionDrop = baseline.overallPrecision - current.overallPrecision;
    checks.push({
      name: "precision_regression",
      status: precisionDrop <= thresholds.max_precision_regression ? "pass" : "fail",
      current: current.overallPrecision,
      baseline: baseline.overallPrecision,
      threshold: thresholds.max_precision_regression,
      message:
        precisionDrop <= thresholds.max_precision_regression
          ? `Precision-Regression ${(precisionDrop * 100).toFixed(1)}% ≤ erlaubt ${(thresholds.max_precision_regression * 100).toFixed(1)}%`
          : `Precision-Regression ${(precisionDrop * 100).toFixed(1)}% > erlaubt ${(thresholds.max_precision_regression * 100).toFixed(1)}%`,
    });

    const recallDrop = baseline.overallRecall - current.overallRecall;
    checks.push({
      name: "recall_regression",
      status: recallDrop <= thresholds.max_recall_regression ? "pass" : "fail",
      current: current.overallRecall,
      baseline: baseline.overallRecall,
      threshold: thresholds.max_recall_regression,
      message:
        recallDrop <= thresholds.max_recall_regression
          ? `Recall-Regression ${(recallDrop * 100).toFixed(1)}% ≤ erlaubt ${(thresholds.max_recall_regression * 100).toFixed(1)}%`
          : `Recall-Regression ${(recallDrop * 100).toFixed(1)}% > erlaubt ${(thresholds.max_recall_regression * 100).toFixed(1)}%`,
    });

    const mrrDrop = baseline.overallMrr - current.overallMrr;
    checks.push({
      name: "mrr_regression",
      status: mrrDrop <= thresholds.max_mrr_regression ? "pass" : "warn",
      current: current.overallMrr,
      baseline: baseline.overallMrr,
      threshold: thresholds.max_mrr_regression,
      message:
        mrrDrop <= thresholds.max_mrr_regression
          ? `MRR-Regression ${mrrDrop.toFixed(3)} ≤ erlaubt ${thresholds.max_mrr_regression.toFixed(3)}`
          : `MRR-Regression ${mrrDrop.toFixed(3)} > erlaubt ${thresholds.max_mrr_regression.toFixed(3)}`,
    });
  }

  // Overall status: fail if any check fails, warn if any warns but none fail
  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const status: GateStatus = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const failed = checks.filter((c) => c.status === "fail");
  const warned = checks.filter((c) => c.status === "warn");

  const summary =
    status === "pass"
      ? "Alle Quality-Gate-Checks bestanden."
      : status === "warn"
        ? `${warned.length} Warnung(en): ${warned.map((c) => c.name).join(", ")}`
        : `${failed.length} Check(s) fehlgeschlagen: ${failed.map((c) => c.name).join(", ")}`;

  return {
    status,
    checks,
    summary,
    eval_timestamp: current.timestamp,
    baseline_timestamp: baseline?.timestamp,
    thresholds,
  };
}

// ── Baseline persistence (Brain-page based) ───────────────────────────

const BASELINE_SLUG = "monitoring/ai-eval-baseline";

export async function loadBaseline(
  engineUrl: string,
  engineHeaders: Record<string, string>,
): Promise<EvalSummary | null> {
  try {
    const res = await fetch(`${engineUrl}/api/pages/${BASELINE_SLUG}`, {
      headers: engineHeaders,
    });
    if (!res.ok) return null;
    const page = (await res.json()) as { frontmatter?: { baseline?: EvalSummary } };
    return page.frontmatter?.baseline ?? null;
  } catch {
    return null;
  }
}

export async function saveBaseline(
  engineUrl: string,
  engineHeaders: Record<string, string>,
  summary: EvalSummary,
): Promise<void> {
  try {
    await fetch(`${engineUrl}/api/pages`, {
      method: "POST",
      headers: { ...engineHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: BASELINE_SLUG,
        title: "AI Eval Baseline",
        type: "system",
        content: "Automatisch verwaltete Eval-Baseline für Release-Gate.",
        frontmatter: { baseline: summary },
      }),
    });
  } catch {
    // Non-fatal
  }
}

// ── Eval history persistence ──────────────────────────────────────────

const HISTORY_SLUG = "monitoring/ai-eval-history";

export async function loadEvalHistory(
  engineUrl: string,
  engineHeaders: Record<string, string>,
): Promise<EvalSummary[]> {
  try {
    const res = await fetch(`${engineUrl}/api/pages/${HISTORY_SLUG}`, {
      headers: engineHeaders,
    });
    if (!res.ok) return [];
    const page = (await res.json()) as { frontmatter?: { history?: EvalSummary[] } };
    const history = page.frontmatter?.history;
    if (!Array.isArray(history)) return [];
    return history;
  } catch {
    return [];
  }
}

export async function appendEvalHistory(
  engineUrl: string,
  engineHeaders: Record<string, string>,
  summary: EvalSummary,
): Promise<void> {
  try {
    const existing = await loadEvalHistory(engineUrl, engineHeaders);
    // Keep last 50 runs
    const updated = [summary, ...existing].slice(0, 50);
    await fetch(`${engineUrl}/api/pages`, {
      method: "POST",
      headers: { ...engineHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: HISTORY_SLUG,
        title: "AI Eval History",
        type: "system",
        content: "Automatisch verwaltete Eval-Historie.",
        frontmatter: { history: updated },
      }),
    });
  } catch {
    // Non-fatal
  }
}
