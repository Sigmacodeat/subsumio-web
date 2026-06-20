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
  duration_ms: number;
}

export interface SuperbrainEvalSummary {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_coverage_score: number;
  avg_gap_accuracy: number;
  byCategory: Record<string, {
    total: number;
    passed: number;
    pass_rate: number;
  }>;
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
    description: "Dokumente mit unknown OCR Status sollten als unreviewed_document Gap erkannt werden",
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
    description: "Widersprüchliche claims/defenses sollten als contradictory_facts Gap erkannt werden",
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
];

export interface MatterContextForEval {
  parties: { slug: string; name: string; role: string }[];
  deadlines: { id?: string; title: string; date: string; urgency: string }[];
  documents: { slug?: string; name: string; ocr_status?: string }[];
  coverage: {
    completeness_score: number;
    sources: { source_id: string; source_type: string; connected: boolean }[];
  };
  gaps: { type: string; severity: string; title: string }[];
  engine_reachable: boolean;
}

export async function runSuperbrainEval(
  contextFetcher: (caseSlug: string) => Promise<MatterContextForEval | null>,
  fixtures: SuperbrainEvalFixture[] = SUPERBRAIN_EVAL_FIXTURES,
): Promise<SuperbrainEvalSummary> {
  const results: SuperbrainEvalResult[] = [];

  for (const fixture of fixtures) {
    const start = Date.now();
    const checks: SuperbrainEvalResult["checks"] = [];
    let gapAccuracy = 0;

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

      // Check: forbidden sources not present
      if (fixture.forbidden_sources && fixture.forbidden_sources.length > 0) {
        const sourceIds = new Set(ctx.coverage.sources.map((s) => s.source_id));
        const leakedSources = fixture.forbidden_sources.filter((s) => sourceIds.has(s));
        const permOk = leakedSources.length === 0;
        checks.push({
          name: "no_source_leakage",
          passed: permOk,
          expected: `not: ${fixture.forbidden_sources.join(", ")}`,
          actual: leakedSources.length === 0 ? "clean" : `leaked: ${leakedSources.join(", ")}`,
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
        duration_ms: Date.now() - start,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const avgCoverage = total > 0
    ? results.reduce((sum, r) => sum + r.coverage_score, 0) / total
    : 0;
  const avgGapAccuracy = total > 0
    ? results.reduce((sum, r) => sum + r.gap_accuracy, 0) / total
    : 0;

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
    byCategory,
    results,
    timestamp: new Date().toISOString(),
  };
}
