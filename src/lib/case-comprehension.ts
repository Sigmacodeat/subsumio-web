/**
 * Case Comprehension Panel — "Akte verstanden?" Spezifikation.
 *
 * Aggregiert einen MatterContextBundle zu einem verdichteten Panel, das
 * auf einen Blick zeigt: Was wissen wir, was fehlt, was ist riskant,
 * wie frisch ist das Wissen, was hat sich zuletzt geändert.
 *
 * P0-BRAIN-005
 */

import type {
  MatterContextBundle,
  MatterFactEntry,
  MatterGap,
  MatterActivityEntry,
  SourceCoverageEntry,
  MatterCoverageStatus,
} from "@/lib/matter-context-types";

// ── Types ─────────────────────────────────────────────────────────────

export type RiskLevel = "critical" | "high" | "medium" | "low" | "none";
export type FreshnessLevel = "fresh" | "stale" | "unknown";

export interface CaseComprehensionPanel {
  case_slug: string;
  case_title: string;

  /** "Akte verstanden?" — verdichtetes Fazit */
  understood: boolean;
  comprehension_score: number; // 0..1

  /** Fakten-Summary */
  facts_summary: {
    total: number;
    high_confidence: number;
    contradictions: number;
    superseded: number;
    recent_changes: number;
    top_facts: CaseComprehensionFact[];
  };

  /** Lücken-Summary */
  gaps_summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    top_gaps: CaseComprehensionGap[];
  };

  /** Risiko-Summary */
  risks_summary: {
    overall_risk: RiskLevel;
    risk_factors: CaseComprehensionRisk[];
    deadline_risk: RiskLevel;
    coverage_risk: RiskLevel;
    contradiction_risk: RiskLevel;
    privilege_risk: RiskLevel;
  };

  /** Frische-Summary */
  freshness_summary: {
    overall_freshness: FreshnessLevel;
    completeness_score: number;
    fresh_sources: number;
    stale_sources: number;
    error_sources: number;
    ocr_pending: number;
    last_activity: string | null;
    staleness_days: number | null;
  };

  /** Zuletzt geänderte Quellen */
  recently_changed_sources: CaseComprehensionSourceChange[];

  /** Empfehlungen */
  recommendations: string[];

  generated_at: string;
}

export interface CaseComprehensionFact {
  id: string;
  statement: string;
  confidence: MatterFactEntry["confidence"];
  source: string;
  is_recent: boolean;
  is_superseded: boolean;
  has_contradiction: boolean;
}

export interface CaseComprehensionGap {
  type: string;
  severity: MatterGap["severity"];
  title: string;
  recommendation: string;
}

export interface CaseComprehensionRisk {
  factor: string;
  level: RiskLevel;
  description: string;
  related_gap_types?: string[];
}

export interface CaseComprehensionSourceChange {
  source_id: string;
  source_label: string;
  source_type: string;
  last_sync_at: string | null;
  is_fresh: boolean;
  document_count: number;
  change_type: "created" | "updated" | "synced" | "error";
}

// ── Constants ─────────────────────────────────────────────────────────

const RECENT_THRESHOLD_HOURS = 72; // 3 days
const STALE_THRESHOLD_DAYS = 30;
const CRITICAL_GAP_TYPES = new Set([
  "engine_unreachable",
  "missing_power_of_attorney",
  "missing_deadline",
  "ethical_wall_violation",
  "unprivileged_communication",
]);

const _HIGH_GAP_TYPES = new Set([
  "missing_document",
  "missing_attachment",
  "contradictory_facts",
  "missing_client_info",
  "incomplete_coverage",
]);

// ── Main builder ──────────────────────────────────────────────────────

export function buildCaseComprehensionPanel(
  bundle: MatterContextBundle,
  now: Date = new Date()
): CaseComprehensionPanel {
  const factsSummary = buildFactsSummary(bundle.facts, now);
  const gapsSummary = buildGapsSummary(bundle.gaps);
  const risksSummary = buildRisksSummary(bundle, gapsSummary);
  const freshnessSummary = buildFreshnessSummary(bundle.coverage, bundle.recent_activity, now);
  const recentlyChanged = buildRecentlyChangedSources(bundle.coverage.sources, now);
  const recommendations = buildRecommendations(gapsSummary, risksSummary, freshnessSummary);

  const comprehensionScore = computeComprehensionScore(
    factsSummary,
    gapsSummary,
    risksSummary,
    freshnessSummary
  );

  const understood =
    comprehensionScore >= 0.6 && gapsSummary.critical === 0 && factsSummary.total > 0;

  return {
    case_slug: bundle.case_slug,
    case_title: bundle.case_title,
    understood,
    comprehension_score: comprehensionScore,
    facts_summary: factsSummary,
    gaps_summary: gapsSummary,
    risks_summary: risksSummary,
    freshness_summary: freshnessSummary,
    recently_changed_sources: recentlyChanged,
    recommendations,
    generated_at: now.toISOString(),
  };
}

// ── Facts Summary ─────────────────────────────────────────────────────

function buildFactsSummary(
  facts: MatterFactEntry[],
  now: Date
): CaseComprehensionPanel["facts_summary"] {
  const nowMs = now.getTime();
  const recentThresholdMs = RECENT_THRESHOLD_HOURS * 60 * 60 * 1000;

  const highConfidence = facts.filter((f) => f.confidence === "high").length;
  const contradictions = facts.filter((f) => f.contradicts && f.contradicts.length > 0).length;
  const superseded = facts.filter((f) => f.superseded_by !== undefined).length;
  const recentChanges = facts.filter((f) => {
    if (!f.date) return false;
    const factMs = new Date(f.date).getTime();
    return nowMs - factMs < recentThresholdMs;
  }).length;

  const activeFacts = facts.filter((f) => !f.superseded_by);
  const sortedByConfidence = [...activeFacts].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });

  const topFacts: CaseComprehensionFact[] = sortedByConfidence.slice(0, 5).map((f) => ({
    id: f.id,
    statement: f.statement,
    confidence: f.confidence,
    source: f.source,
    is_recent: f.date ? nowMs - new Date(f.date).getTime() < recentThresholdMs : false,
    is_superseded: false,
    has_contradiction: !!(f.contradicts && f.contradicts.length > 0),
  }));

  return {
    total: facts.length,
    high_confidence: highConfidence,
    contradictions,
    superseded,
    recent_changes: recentChanges,
    top_facts: topFacts,
  };
}

// ── Gaps Summary ──────────────────────────────────────────────────────

function buildGapsSummary(gaps: MatterGap[]): CaseComprehensionPanel["gaps_summary"] {
  const bySeverity = {
    critical: gaps.filter((g) => g.severity === "critical").length,
    high: gaps.filter((g) => g.severity === "high").length,
    medium: gaps.filter((g) => g.severity === "medium").length,
    low: gaps.filter((g) => g.severity === "low").length,
    info: gaps.filter((g) => g.severity === "info").length,
  };

  const sorted = [...gaps].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return order[a.severity] - order[b.severity];
  });

  const topGaps: CaseComprehensionGap[] = sorted.slice(0, 5).map((g) => ({
    type: g.type,
    severity: g.severity,
    title: g.title,
    recommendation: g.recommendation,
  }));

  return {
    total: gaps.length,
    ...bySeverity,
    top_gaps: topGaps,
  };
}

// ── Risks Summary ─────────────────────────────────────────────────────

function buildRisksSummary(
  bundle: MatterContextBundle,
  _gapsSummary: CaseComprehensionPanel["gaps_summary"]
): CaseComprehensionPanel["risks_summary"] {
  const riskFactors: CaseComprehensionRisk[] = [];

  // Deadline risk
  const overdueDeadlines = bundle.deadlines.filter((d) => d.urgency === "overdue");
  const criticalDeadlines = bundle.deadlines.filter((d) => d.urgency === "critical");
  let deadlineRisk: RiskLevel = "none";
  if (overdueDeadlines.length > 0) {
    deadlineRisk = "critical";
    riskFactors.push({
      factor: "overdue_deadlines",
      level: "critical",
      description: `${overdueDeadlines.length} überfällige Frist(en)`,
      related_gap_types: ["missing_deadline"],
    });
  } else if (criticalDeadlines.length > 0) {
    deadlineRisk = "high";
    riskFactors.push({
      factor: "critical_deadlines",
      level: "high",
      description: `${criticalDeadlines.length} kritische Frist(en) in nächster Zeit`,
      related_gap_types: ["missing_deadline"],
    });
  }

  // Coverage risk
  let coverageRisk: RiskLevel = "none";
  if (!bundle.engine_reachable) {
    coverageRisk = "critical";
    riskFactors.push({
      factor: "engine_unreachable",
      level: "critical",
      description: "Brain Engine nicht erreichbar — Kontext unvollständig",
      related_gap_types: ["engine_unreachable"],
    });
  } else if (bundle.coverage.completeness_score < 0.3) {
    coverageRisk = "high";
    riskFactors.push({
      factor: "low_coverage",
      level: "high",
      description: `Coverage-Score sehr niedrig (${(bundle.coverage.completeness_score * 100).toFixed(0)}%)`,
      related_gap_types: ["incomplete_coverage"],
    });
  } else if (bundle.coverage.completeness_score < 0.6) {
    coverageRisk = "medium";
    riskFactors.push({
      factor: "moderate_coverage",
      level: "medium",
      description: `Coverage-Score moderat (${(bundle.coverage.completeness_score * 100).toFixed(0)}%)`,
      related_gap_types: ["incomplete_coverage"],
    });
  }

  // Contradiction risk
  let contradictionRisk: RiskLevel = "none";
  const contradictionGaps = bundle.gaps.filter((g) => g.type === "contradictory_facts");
  if (contradictionGaps.length > 0) {
    contradictionRisk = contradictionGaps.length > 1 ? "high" : "medium";
    riskFactors.push({
      factor: "contradictory_facts",
      level: contradictionRisk,
      description: `${contradictionGaps.length} widersprüchliche Fakten erkannt`,
      related_gap_types: ["contradictory_facts"],
    });
  }

  // Privilege risk
  let privilegeRisk: RiskLevel = "none";
  const privilegeGaps = bundle.gaps.filter(
    (g) => g.type === "unprivileged_communication" || g.type === "ethical_wall_violation"
  );
  if (privilegeGaps.length > 0) {
    privilegeRisk = "critical";
    riskFactors.push({
      factor: "privilege_violation",
      level: "critical",
      description: `${privilegeGaps.length} Privilegierungs-/Ethical-Wall-Verletzung(en)`,
      related_gap_types: privilegeGaps.map((g) => g.type),
    });
  }

  // Critical gaps as risk factors
  const criticalGaps = bundle.gaps.filter((gapItem) => CRITICAL_GAP_TYPES.has(gapItem.type));
  for (const gap of criticalGaps) {
    if (!riskFactors.some((r) => r.related_gap_types?.includes(gap.type))) {
      riskFactors.push({
        factor: gap.type,
        level: "critical",
        description: gap.title,
        related_gap_types: [gap.type],
      });
    }
  }

  // Overall risk = highest individual risk
  const allRisks = [deadlineRisk, coverageRisk, contradictionRisk, privilegeRisk];
  const riskOrder: Record<RiskLevel, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  const overallRisk = allRisks.reduce<RiskLevel>(
    (max, r) => (riskOrder[r] > riskOrder[max] ? r : max),
    "none"
  );

  return {
    overall_risk: overallRisk,
    risk_factors: riskFactors,
    deadline_risk: deadlineRisk,
    coverage_risk: coverageRisk,
    contradiction_risk: contradictionRisk,
    privilege_risk: privilegeRisk,
  };
}

// ── Freshness Summary ─────────────────────────────────────────────────

function buildFreshnessSummary(
  coverage: MatterCoverageStatus,
  activity: MatterActivityEntry[],
  now: Date
): CaseComprehensionPanel["freshness_summary"] {
  const lastActivity =
    activity.length > 0
      ? (activity
          .map((a) => a.at)
          .sort()
          .at(-1) ?? null)
      : null;

  let stalenessDays: number | null = null;
  if (lastActivity) {
    stalenessDays = Math.floor(
      (now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  let overallFreshness: FreshnessLevel = "unknown";
  if (
    coverage.overall_freshness === "fresh" &&
    (stalenessDays === null || stalenessDays < STALE_THRESHOLD_DAYS)
  ) {
    overallFreshness = "fresh";
  } else if (
    coverage.overall_freshness === "stale" ||
    (stalenessDays !== null && stalenessDays >= STALE_THRESHOLD_DAYS)
  ) {
    overallFreshness = "stale";
  }

  return {
    overall_freshness: overallFreshness,
    completeness_score: coverage.completeness_score,
    fresh_sources: coverage.fresh_sources,
    stale_sources: coverage.stale_sources,
    error_sources: coverage.error_sources,
    ocr_pending: coverage.ocr_pending,
    last_activity: lastActivity,
    staleness_days: stalenessDays,
  };
}

// ── Recently Changed Sources ──────────────────────────────────────────

function buildRecentlyChangedSources(
  sources: SourceCoverageEntry[],
  now: Date
): CaseComprehensionSourceChange[] {
  const nowMs = now.getTime();
  const recentMs = RECENT_THRESHOLD_HOURS * 60 * 60 * 1000;

  return sources
    .filter((s) => s.last_sync_at !== null)
    .map((s) => {
      const syncMs = new Date(s.last_sync_at!).getTime();
      const isRecent = nowMs - syncMs < recentMs;
      return {
        source_id: s.source_id,
        source_label: s.source_label,
        source_type: s.source_type,
        last_sync_at: s.last_sync_at,
        is_fresh: s.index_fresh,
        document_count: s.document_count,
        change_type: s.error
          ? ("error" as const)
          : isRecent
            ? ("synced" as const)
            : ("updated" as const),
      };
    })
    .sort((a, b) => {
      if (!a.last_sync_at) return 1;
      if (!b.last_sync_at) return -1;
      return new Date(b.last_sync_at).getTime() - new Date(a.last_sync_at).getTime();
    })
    .slice(0, 10);
}

// ── Recommendations ───────────────────────────────────────────────────

function buildRecommendations(
  gaps: CaseComprehensionPanel["gaps_summary"],
  risks: CaseComprehensionPanel["risks_summary"],
  freshness: CaseComprehensionPanel["freshness_summary"]
): string[] {
  const recs: string[] = [];

  if (gaps.critical > 0) {
    recs.push(`${gaps.critical} kritische Lücke(n) sofort bearbeiten`);
  }
  if (risks.deadline_risk === "critical") {
    recs.push("Überfällige Fristen sofort klären");
  }
  if (risks.privilege_risk === "critical") {
    recs.push("Privilegierungs-/Ethical-Wall-Verletzung prüfen");
  }
  if (risks.coverage_risk === "critical") {
    recs.push("Brain Engine Erreichbarkeit prüfen");
  } else if (risks.coverage_risk === "high") {
    recs.push("Quellen-Anbindung und Coverage verbessern");
  }
  if (freshness.ocr_pending > 0) {
    recs.push(`${freshness.ocr_pending} Dokument(e) mit ausstehender OCR`);
  }
  if (freshness.stale_sources > 0) {
    recs.push(`${freshness.stale_sources} Quelle(n) sind veraltet — Sync prüfen`);
  }
  if (risks.contradiction_risk !== "none") {
    recs.push("Widersprüchliche Fakten auflösen");
  }
  if (recs.length === 0) {
    recs.push("Akte ist in gutem Zustand — keine dringenden Maßnahmen erforderlich");
  }

  return recs;
}

// ── Comprehension Score ───────────────────────────────────────────────

function computeComprehensionScore(
  facts: CaseComprehensionPanel["facts_summary"],
  gaps: CaseComprehensionPanel["gaps_summary"],
  risks: CaseComprehensionPanel["risks_summary"],
  freshness: CaseComprehensionPanel["freshness_summary"]
): number {
  let score = 1.0;

  // Penalty for gaps
  score -= gaps.critical * 0.2;
  score -= gaps.high * 0.1;
  score -= gaps.medium * 0.05;
  score -= gaps.low * 0.02;

  // Penalty for risks
  const riskPenalty: Record<RiskLevel, number> = {
    critical: 0.2,
    high: 0.1,
    medium: 0.05,
    low: 0.02,
    none: 0,
  };
  score -= riskPenalty[risks.overall_risk];

  // Penalty for low coverage
  if (freshness.completeness_score < 0.3) score -= 0.15;
  else if (freshness.completeness_score < 0.6) score -= 0.08;

  // Penalty for stale data
  if (freshness.overall_freshness === "stale") score -= 0.1;
  if (freshness.error_sources > 0) score -= 0.05;

  // Penalty for contradictions
  if (facts.contradictions > 0) score -= 0.05 * Math.min(facts.contradictions, 3);

  // Penalty for no facts
  if (facts.total === 0) score -= 0.1;

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
