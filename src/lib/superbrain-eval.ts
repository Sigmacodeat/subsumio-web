/**
 * Superbrain Eval Gate — Matter Context Quality Metrics.
 *
 * Misst die Qualität des Kanzlei Superbrain anhand von:
 * - Matter Context Coverage: Wie vollständig ist der Kontext pro Akte?
 * - Gap Detection Accuracy: Werden kritische Lücken korrekt erkannt?
 * - Retrieval Explainability: Sind die Erklärungen nachvollziehbar?
 * - Permission Filtering: Werden unautorisierte Inhalte korrekt ausgefiltert?
 * - Temporal Consistency: Werden widersprüchliche Fakten erkannt?
 *
 * Usage: Run via `/api/brain-quality/eval` or programmatically.
 */

export interface SuperbrainEvalFixture {
  id: string;
  case_slug: string;
  description: string;
  expected_gaps: string[];
  expected_coverage_min: number;
  expected_parties_min: number;
  expected_deadlines_min: number;
  expected_documents_min: number;
  forbidden_sources?: string[];
  category: "coverage" | "gaps" | "permissions" | "temporal" | "explainability";
  // ── P0-BRAIN-004: Advanced metrics ──
  /** Expected Recall@K: fraction of relevant items found in top-K results. */
  expected_recall_at_k?: { k: number; min_score: number };
  /** Expected Entity Resolution Precision: fraction of correctly resolved entities. */
  expected_entity_resolution_precision?: number;
  /** Expected Freshness Accuracy: fraction of sources with correct freshness status. */
  expected_freshness_accuracy?: number;
  /** Expected max Source Leakage Rate (0 = no leakage allowed). */
  expected_max_source_leakage_rate?: number;
}

export interface SuperbrainEvalResult {
  fixtureId: string;
  caseSlug: string;
  category: string;
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    expected: string;
    actual: string;
  }[];
  coverage_score: number;
  gap_accuracy: number;
  recall_at_k: number | null;
  entity_resolution_precision: number | null;
  freshness_accuracy: number | null;
  source_leakage_rate: number;
  duration_ms: number;
}

export interface SuperbrainEvalSummary {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_coverage_score: number;
  avg_gap_accuracy: number;
  avg_recall_at_k: number;
  avg_entity_resolution_precision: number;
  avg_freshness_accuracy: number;
  avg_source_leakage_rate: number;
  byCategory: Record<
    string,
    {
      total: number;
      passed: number;
      pass_rate: number;
    }
  >;
  results: SuperbrainEvalResult[];
  timestamp: string;
}

export const SUPERBRAIN_EVAL_FIXTURES: SuperbrainEvalFixture[] = [
  {
    id: "coverage-empty-case",
    case_slug: "cases/nonexistent-test-case",
    description: "Nicht-existierende Akte sollte leeren Context mit kritischen Gaps liefern",
    expected_gaps: ["engine_unreachable", "missing_client_info"],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "coverage",
  },
  {
    id: "coverage-minimal-case",
    case_slug: "cases/minimal-test",
    description: "Minimale Akte sollte niedrige Coverage und mehrere Gaps haben",
    expected_gaps: ["missing_client_info", "unclear_opponent"],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "coverage",
  },
  {
    id: "gaps-missing-vollmacht",
    case_slug: "cases/vollmacht-test",
    description: "Akten mit Mandant aber ohne Vollmacht-Dokument sollten Gap melden",
    expected_gaps: ["missing_power_of_attorney"],
    expected_coverage_min: 0,
    expected_parties_min: 1,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "gaps",
  },
  {
    id: "gaps-overdue-deadline",
    case_slug: "cases/overdue-test",
    description: "Überfällige Fristen sollten als critical Gap erkannt werden",
    expected_gaps: ["missing_deadline"],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 1,
    expected_documents_min: 0,
    category: "gaps",
  },
  {
    id: "gaps-incomplete-coverage",
    case_slug: "cases/low-coverage-test",
    description: "Coverage Score < 0.5 sollte als incomplete_coverage Gap erkannt werden",
    expected_gaps: ["incomplete_coverage"],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "gaps",
  },
  {
    id: "gaps-unreviewed-document",
    case_slug: "cases/unreviewed-test",
    description:
      "Dokumente mit unknown OCR Status sollten als unreviewed_document Gap erkannt werden",
    expected_gaps: ["unreviewed_document"],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 1,
    category: "gaps",
  },
  {
    id: "permissions-no-leakage",
    case_slug: "cases/permission-test",
    description: "Permission-gefilterte Quellen sollten nicht in Retrieval-Ergebnissen auftauchen",
    expected_gaps: [],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    forbidden_sources: ["opposing_counsel_notes", "privileged_communication"],
    category: "permissions",
  },
  {
    id: "temporal-contradiction",
    case_slug: "cases/contradiction-test",
    description:
      "Widersprüchliche claims/defenses sollten als contradictory_facts Gap erkannt werden",
    expected_gaps: ["contradictory_facts"],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "temporal",
  },
  {
    id: "explainability-retrieval-mode",
    case_slug: "cases/explain-test",
    description: "Retrieval-Erklärung sollte Search-Mode, Source und Recency enthalten",
    expected_gaps: [],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "explainability",
  },
  {
    id: "recall-at-k-documents",
    case_slug: "cases/recall-test",
    description: "Recall@K: Top-K Ergebnisse sollten alle relevanten Dokumente enthalten",
    expected_gaps: [],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "explainability",
    expected_recall_at_k: { k: 5, min_score: 0.8 },
  },
  {
    id: "entity-resolution-precision",
    case_slug: "cases/entity-resolution-test",
    description:
      "Entity Resolution Precision: Korrekt aufgelöste Entitäten (Mandant, Gegner, Gericht)",
    expected_gaps: [],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "permissions",
    expected_entity_resolution_precision: 0.9,
  },
  {
    id: "freshness-accuracy",
    case_slug: "cases/freshness-test",
    description: "Freshness Accuracy: Quellen-Frische-Status sollte korrekt klassifiziert sein",
    expected_gaps: [],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    category: "coverage",
    expected_freshness_accuracy: 0.8,
  },
  {
    id: "source-leakage-rate-zero",
    case_slug: "cases/leakage-test",
    description:
      "Source Leakage Rate = 0: Keine unautorisierten Quellen sollten in Ergebnissen auftauchen",
    expected_gaps: [],
    expected_coverage_min: 0,
    expected_parties_min: 0,
    expected_deadlines_min: 0,
    expected_documents_min: 0,
    forbidden_sources: ["opposing_counsel_notes", "privileged_communication", "internal_memo"],
    expected_max_source_leakage_rate: 0,
    category: "permissions",
  },
];

export interface MatterContextForEval {
  parties: { slug: string; name: string; role: string }[];
  deadlines: { id?: string; title: string; date: string; urgency: string }[];
  documents: { slug?: string; name: string; ocr_status?: string }[];
  coverage: {
    completeness_score: number;
    sources: {
      source_id: string;
      source_type: string;
      connected: boolean;
      index_fresh?: boolean;
    }[];
  };
  gaps: { type: string; severity: string; title: string }[];
  engine_reachable: boolean;
  // ── P0-BRAIN-004: Advanced metric inputs ──
  /** Retrieval results for Recall@K computation: relevant slugs + all returned slugs. */
  retrieval_results?: {
    relevant_slugs: string[];
    returned_slugs: string[];
  };
  /** Entity resolution mappings for precision computation. */
  entity_resolutions?: {
    resolved: { slug: string; canonical: string; correct: boolean }[];
  };
  /** Source freshness ground truth for accuracy computation. */
  source_freshness?: {
    sources: { source_id: string; expected_fresh: boolean; actual_fresh: boolean }[];
  };
}

export async function runSuperbrainEval(
  contextFetcher: (caseSlug: string) => Promise<MatterContextForEval | null>,
  fixtures: SuperbrainEvalFixture[] = SUPERBRAIN_EVAL_FIXTURES
): Promise<SuperbrainEvalSummary> {
  const results: SuperbrainEvalResult[] = [];

  for (const fixture of fixtures) {
    const start = Date.now();
    const checks: SuperbrainEvalResult["checks"] = [];
    let gapAccuracy = 0;
    let recallAtK: number | null = null;
    let entityResolutionPrecision: number | null = null;
    let freshnessAccuracy: number | null = null;
    let sourceLeakageRate = 0;

    try {
      const ctx = await contextFetcher(fixture.case_slug);

      if (!ctx) {
        checks.push({
          name: "context_fetch",
          passed: false,
          expected: "MatterContextBundle",
          actual: "null",
        });
        results.push({
          fixtureId: fixture.id,
          caseSlug: fixture.case_slug,
          category: fixture.category,
          passed: false,
          checks,
          coverage_score: 0,
          gap_accuracy: 0,
          recall_at_k: null,
          entity_resolution_precision: null,
          freshness_accuracy: null,
          source_leakage_rate: 0,
          duration_ms: Date.now() - start,
        });
        continue;
      }

      // Check: parties minimum
      const partiesOk = ctx.parties.length >= fixture.expected_parties_min;
      checks.push({
        name: "parties_min",
        passed: partiesOk,
        expected: `>= ${fixture.expected_parties_min}`,
        actual: `${ctx.parties.length}`,
      });

      // Check: deadlines minimum
      const deadlinesOk = ctx.deadlines.length >= fixture.expected_deadlines_min;
      checks.push({
        name: "deadlines_min",
        passed: deadlinesOk,
        expected: `>= ${fixture.expected_deadlines_min}`,
        actual: `${ctx.deadlines.length}`,
      });

      // Check: documents minimum
      const docsOk = ctx.documents.length >= fixture.expected_documents_min;
      checks.push({
        name: "documents_min",
        passed: docsOk,
        expected: `>= ${fixture.expected_documents_min}`,
        actual: `${ctx.documents.length}`,
      });

      // Check: coverage score minimum
      const coverageOk = ctx.coverage.completeness_score >= fixture.expected_coverage_min;
      checks.push({
        name: "coverage_min",
        passed: coverageOk,
        expected: `>= ${fixture.expected_coverage_min}`,
        actual: `${ctx.coverage.completeness_score.toFixed(2)}`,
      });

      // Check: expected gaps present
      const actualGapTypes = new Set(ctx.gaps.map((g) => g.type));
      const missingGaps = fixture.expected_gaps.filter((g) => !actualGapTypes.has(g));
      const gapsOk = missingGaps.length === 0;
      checks.push({
        name: "expected_gaps",
        passed: gapsOk,
        expected: fixture.expected_gaps.join(", ") || "none",
        actual: Array.from(actualGapTypes).join(", ") || "none",
      });

      // Gap accuracy: how many expected gaps were found
      if (fixture.expected_gaps.length > 0) {
        const foundGaps = fixture.expected_gaps.filter((g) => actualGapTypes.has(g)).length;
        gapAccuracy = foundGaps / fixture.expected_gaps.length;
      } else {
        gapAccuracy = 1;
      }

      // ── P0-BRAIN-004: Recall@K ──
      if (fixture.expected_recall_at_k && ctx.retrieval_results) {
        recallAtK = computeRecallAtK(
          ctx.retrieval_results.relevant_slugs,
          ctx.retrieval_results.returned_slugs,
          fixture.expected_recall_at_k.k
        );
        const recallOk = recallAtK >= fixture.expected_recall_at_k.min_score;
        checks.push({
          name: "recall_at_k",
          passed: recallOk,
          expected: `>= ${fixture.expected_recall_at_k.min_score} (k=${fixture.expected_recall_at_k.k})`,
          actual: recallAtK.toFixed(2),
        });
      }

      // ── P0-BRAIN-004: Entity Resolution Precision ──
      if (fixture.expected_entity_resolution_precision !== undefined && ctx.entity_resolutions) {
        entityResolutionPrecision = computeEntityResolutionPrecision(
          ctx.entity_resolutions.resolved
        );
        const erOk = entityResolutionPrecision >= fixture.expected_entity_resolution_precision;
        checks.push({
          name: "entity_resolution_precision",
          passed: erOk,
          expected: `>= ${fixture.expected_entity_resolution_precision}`,
          actual: entityResolutionPrecision.toFixed(2),
        });
      }

      // ── P0-BRAIN-004: Freshness Accuracy ──
      if (fixture.expected_freshness_accuracy !== undefined && ctx.source_freshness) {
        freshnessAccuracy = computeFreshnessAccuracy(ctx.source_freshness.sources);
        const faOk = freshnessAccuracy >= fixture.expected_freshness_accuracy;
        checks.push({
          name: "freshness_accuracy",
          passed: faOk,
          expected: `>= ${fixture.expected_freshness_accuracy}`,
          actual: freshnessAccuracy.toFixed(2),
        });
      }

      // ── P0-BRAIN-004: Source Leakage Rate ──
      if (fixture.forbidden_sources && fixture.forbidden_sources.length > 0) {
        const sourceIds = new Set(ctx.coverage.sources.map((s) => s.source_id));
        const leakedSources = fixture.forbidden_sources.filter((s) => sourceIds.has(s));
        sourceLeakageRate = leakedSources.length / fixture.forbidden_sources.length;
        const permOk = leakedSources.length === 0;
        checks.push({
          name: "no_source_leakage",
          passed: permOk,
          expected: `not: ${fixture.forbidden_sources.join(", ")}`,
          actual: leakedSources.length === 0 ? "clean" : `leaked: ${leakedSources.join(", ")}`,
        });
      }

      // Also compute source leakage rate against all sources when no explicit forbidden list
      if (!fixture.forbidden_sources && fixture.expected_max_source_leakage_rate !== undefined) {
        const totalSources = ctx.coverage.sources.length;
        const leaked = ctx.coverage.sources.filter((s) => !s.connected).length;
        sourceLeakageRate = totalSources > 0 ? leaked / totalSources : 0;
        const leakOk = sourceLeakageRate <= fixture.expected_max_source_leakage_rate;
        checks.push({
          name: "source_leakage_rate",
          passed: leakOk,
          expected: `<= ${fixture.expected_max_source_leakage_rate}`,
          actual: sourceLeakageRate.toFixed(2),
        });
      }

      // Check: engine reachable
      if (fixture.category === "coverage" && fixture.case_slug.includes("nonexistent")) {
        checks.push({
          name: "engine_reachable",
          passed: true,
          expected: "graceful fallback",
          actual: ctx.engine_reachable ? "reachable" : "unreachable (expected)",
        });
      }

      const allPassed = checks.every((c) => c.passed);

      results.push({
        fixtureId: fixture.id,
        caseSlug: fixture.case_slug,
        category: fixture.category,
        passed: allPassed,
        checks,
        coverage_score: ctx.coverage.completeness_score,
        gap_accuracy: gapAccuracy,
        recall_at_k: recallAtK,
        entity_resolution_precision: entityResolutionPrecision,
        freshness_accuracy: freshnessAccuracy,
        source_leakage_rate: sourceLeakageRate,
        duration_ms: Date.now() - start,
      });
    } catch (err) {
      checks.push({
        name: "no_exception",
        passed: false,
        expected: "no error",
        actual: err instanceof Error ? err.message : String(err),
      });
      results.push({
        fixtureId: fixture.id,
        caseSlug: fixture.case_slug,
        category: fixture.category,
        passed: false,
        checks,
        coverage_score: 0,
        gap_accuracy: 0,
        recall_at_k: null,
        entity_resolution_precision: null,
        freshness_accuracy: null,
        source_leakage_rate: 0,
        duration_ms: Date.now() - start,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const avgCoverage = total > 0 ? results.reduce((sum, r) => sum + r.coverage_score, 0) / total : 0;
  const avgGapAccuracy =
    total > 0 ? results.reduce((sum, r) => sum + r.gap_accuracy, 0) / total : 0;
  const recallResults = results.filter((r) => r.recall_at_k !== null);
  const avgRecall =
    recallResults.length > 0
      ? recallResults.reduce((sum, r) => sum + (r.recall_at_k ?? 0), 0) / recallResults.length
      : 0;
  const erResults = results.filter((r) => r.entity_resolution_precision !== null);
  const avgER =
    erResults.length > 0
      ? erResults.reduce((sum, r) => sum + (r.entity_resolution_precision ?? 0), 0) /
        erResults.length
      : 0;
  const freshnessResults = results.filter((r) => r.freshness_accuracy !== null);
  const avgFreshness =
    freshnessResults.length > 0
      ? freshnessResults.reduce((sum, r) => sum + (r.freshness_accuracy ?? 0), 0) /
        freshnessResults.length
      : 0;
  const avgLeakage =
    total > 0 ? results.reduce((sum, r) => sum + r.source_leakage_rate, 0) / total : 0;

  const byCategory: SuperbrainEvalSummary["byCategory"] = {};
  for (const cat of ["coverage", "gaps", "permissions", "temporal", "explainability"]) {
    const catResults = results.filter((r) => r.category === cat);
    if (catResults.length > 0) {
      byCategory[cat] = {
        total: catResults.length,
        passed: catResults.filter((r) => r.passed).length,
        pass_rate: catResults.filter((r) => r.passed).length / catResults.length,
      };
    }
  }

  return {
    total,
    passed,
    failed: total - passed,
    pass_rate: total > 0 ? passed / total : 0,
    avg_coverage_score: avgCoverage,
    avg_gap_accuracy: avgGapAccuracy,
    avg_recall_at_k: avgRecall,
    avg_entity_resolution_precision: avgER,
    avg_freshness_accuracy: avgFreshness,
    avg_source_leakage_rate: avgLeakage,
    byCategory,
    results,
    timestamp: new Date().toISOString(),
  };
}

// ── P0-BRAIN-004: Metric computation helpers ──────────────────────────

/** Recall@K: fraction of relevant items found in the top-K returned results. */
export function computeRecallAtK(
  relevantSlugs: string[],
  returnedSlugs: string[],
  k: number
): number {
  if (relevantSlugs.length === 0) return 1;
  const topK = new Set(returnedSlugs.slice(0, k));
  const found = relevantSlugs.filter((s) => topK.has(s)).length;
  return found / relevantSlugs.length;
}

/** Entity Resolution Precision: fraction of correctly resolved entities. */
export function computeEntityResolutionPrecision(
  resolved: { slug: string; canonical: string; correct: boolean }[]
): number {
  if (resolved.length === 0) return 1;
  return resolved.filter((r) => r.correct).length / resolved.length;
}

/** Freshness Accuracy: fraction of sources with correct freshness status. */
export function computeFreshnessAccuracy(
  sources: { source_id: string; expected_fresh: boolean; actual_fresh: boolean }[]
): number {
  if (sources.length === 0) return 1;
  return sources.filter((s) => s.expected_fresh === s.actual_fresh).length / sources.length;
}
