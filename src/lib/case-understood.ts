/**
 * Case Understood Panel — "Akte verstanden?" Analyse-Modul.
 *
 * Baut eine strukturierte Zusammenfassung aus einem MatterContextBundle,
 * die im Dashboard als "Akte verstanden?"-Panel angezeigt wird.
 *
 * Komponenten:
 *   1. Fakten — Extrahierte Fakten mit Confidence und Widersprüchen
 *   2. Lücken — Erkannte Datenlücken sortiert nach Severity
 *   3. Risiken — Risiko-Indikatoren aus Fakten, Deadlines und Berechtigungen
 *   4. Frische — Source-Coverage und Freshness-Status
 *   5. Zuletzt geänderte Quellen — Letzte Aktivitäten und Dokument-Updates
 */

import type {
  MatterContextBundle,
  MatterGap,
  MatterFactEntry,
  MatterCoverageStatus,
  MatterActivityEntry,
} from "@/lib/matter-context-types";

// ── Types ─────────────────────────────────────────────────────────────

export type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

export interface CaseRiskIndicator {
  level: RiskLevel;
  category: string;
  title: string;
  description: string;
  source: string;
}

export interface CaseFreshnessSummary {
  overall: "fresh" | "stale" | "unknown";
  completeness_score: number;
  fresh_sources: number;
  stale_sources: number;
  error_sources: number;
  ocr_pending: number;
  oldest_sync: string | null;
  newest_activity: string | null;
}

export interface CaseFactSummary {
  total: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  contradicted: number;
  superseded: number;
  items: MatterFactEntry[];
}

export interface CaseGapSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  items: MatterGap[];
}

export interface CaseRecentSourcesSummary {
  sources: Array<{
    source_id: string;
    source_label: string;
    source_type: string;
    last_sync_at: string | null;
    connected: boolean;
    fresh: boolean;
  }>;
  recent_activity: MatterActivityEntry[];
}

export interface CaseUnderstoodPanel {
  case_slug: string;
  case_title: string;
  case_number?: string;
  status?: string;
  generated_at: string;
  facts: CaseFactSummary;
  gaps: CaseGapSummary;
  risks: CaseRiskIndicator[];
  freshness: CaseFreshnessSummary;
  recent_sources: CaseRecentSourcesSummary;
  overall_assessment: CaseAssessment;
}

export type CaseAssessment = "well_understood" | "partially_understood" | "poorly_understood" | "unknown";

// ── Label Maps ────────────────────────────────────────────────────────

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  critical: "Kritisch",
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
  info: "Info",
};

export const ASSESSMENT_LABELS: Record<CaseAssessment, string> = {
  well_understood: "Akte gut verstanden",
  partially_understood: "Akte teilweise verstanden",
  poorly_understood: "Akte unvollständig",
  unknown: "Akte nicht bewertbar",
};

// ── Builders ──────────────────────────────────────────────────────────

export function buildFactSummary(facts: MatterFactEntry[]): CaseFactSummary {
  const contradicted = facts.filter((f) => f.contradicts && f.contradicts.length > 0).length;
  const superseded = facts.filter((f) => f.superseded_by).length;

  return {
    total: facts.length,
    high_confidence: facts.filter((f) => f.confidence === "high").length,
    medium_confidence: facts.filter((f) => f.confidence === "medium").length,
    low_confidence: facts.filter((f) => f.confidence === "low").length,
    contradicted,
    superseded,
    items: facts,
  };
}

export function buildGapSummary(gaps: MatterGap[]): CaseGapSummary {
  return {
    total: gaps.length,
    critical: gaps.filter((g) => g.severity === "critical").length,
    high: gaps.filter((g) => g.severity === "high").length,
    medium: gaps.filter((g) => g.severity === "medium").length,
    low: gaps.filter((g) => g.severity === "low").length,
    info: gaps.filter((g) => g.severity === "info").length,
    items: gaps,
  };
}

export function buildRiskIndicators(bundle: MatterContextBundle): CaseRiskIndicator[] {
  const risks: CaseRiskIndicator[] = [];

  // Risk from gaps
  for (const gap of bundle.gaps) {
    if (gap.severity === "critical" || gap.severity === "high") {
      risks.push({
        level: gap.severity as RiskLevel,
        category: "gap",
        title: gap.title,
        description: gap.description,
        source: `gap:${gap.type}`,
      });
    }
  }

  // Risk from overdue deadlines
  for (const deadline of bundle.deadlines) {
    if (deadline.urgency === "overdue") {
      risks.push({
        level: "critical",
        category: "deadline",
        title: `Frist überschritten: ${deadline.title}`,
        description: `Die Frist "${deadline.title}" war am ${deadline.date} fällig.`,
        source: `deadline:${deadline.id ?? deadline.title}`,
      });
    } else if (deadline.urgency === "critical") {
      risks.push({
        level: "high",
        category: "deadline",
        title: `Kritische Frist: ${deadline.title}`,
        description: `Die Frist "${deadline.title}" läuft am ${deadline.date} ab.`,
        source: `deadline:${deadline.id ?? deadline.title}`,
      });
    }
  }

  // Risk from ethical wall violations
  if (bundle.permissions.ethical_wall_active && bundle.permissions.blocked_users.length > 0) {
    const overlap = bundle.permissions.allowed_users.filter((u) =>
      bundle.permissions.blocked_users.includes(u),
    );
    if (overlap.length > 0) {
      risks.push({
        level: "critical",
        category: "permission",
        title: "Ethical Wall Verletzung",
        description: `${overlap.length} Benutzer sind gleichzeitig erlaubt und blockiert.`,
        source: "permission:ethical_wall",
      });
    }
  }

  // Risk from low fact confidence
  const lowConfidenceFacts = bundle.facts.filter((f) => f.confidence === "low");
  if (lowConfidenceFacts.length > 0) {
    risks.push({
      level: "medium",
      category: "fact_quality",
      title: `${lowConfidenceFacts.length} Fakten mit niedriger Confidence`,
      description: "Einige Fakten sind nur mit niedriger Confidence extrahiert worden.",
      source: "facts:low_confidence",
    });
  }

  // Risk from contradicted facts
  const contradicted = bundle.facts.filter((f) => f.contradicts && f.contradicts.length > 0);
  if (contradicted.length > 0) {
    risks.push({
      level: "medium",
      category: "fact_quality",
      title: `${contradicted.length} widersprüchliche Fakten`,
      description: "Es gibt widersprüchliche Aussagen in der Akte.",
      source: "facts:contradicted",
    });
  }

  // Risk from stale sources
  if (bundle.coverage.stale_sources > 0) {
    risks.push({
      level: "low",
      category: "freshness",
      title: `${bundle.coverage.stale_sources} veraltete Quellen`,
      description: "Einige Quellen sind nicht mehr aktuell.",
      source: "coverage:stale",
    });
  }

  // Risk from engine unreachable
  if (!bundle.engine_reachable) {
    risks.push({
      level: "critical",
      category: "system",
      title: "Engine nicht erreichbar",
      description: "Die Engine ist nicht erreichbar — Aktenkontext konnte nicht vollständig geladen werden.",
      source: "system:engine",
    });
  }

  // Sort by severity (critical first)
  const severityOrder: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  risks.sort((a, b) => severityOrder[a.level] - severityOrder[b.level]);

  return risks;
}

export function buildFreshnessSummary(
  coverage: MatterCoverageStatus,
  activity: MatterActivityEntry[],
): CaseFreshnessSummary {
  const sortedActivity = [...activity].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  const syncDates = coverage.sources
    .map((s) => s.last_sync_at)
    .filter((d): d is string => d !== null)
    .sort();

  return {
    overall: coverage.overall_freshness,
    completeness_score: coverage.completeness_score,
    fresh_sources: coverage.fresh_sources,
    stale_sources: coverage.stale_sources,
    error_sources: coverage.error_sources,
    ocr_pending: coverage.ocr_pending,
    oldest_sync: syncDates[0] ?? null,
    newest_activity: sortedActivity[0]?.at ?? null,
  };
}

export function buildRecentSourcesSummary(
  coverage: MatterCoverageStatus,
  activity: MatterActivityEntry[],
): CaseRecentSourcesSummary {
  const sources = coverage.sources
    .map((s) => ({
      source_id: s.source_id,
      source_label: s.source_label,
      source_type: s.source_type,
      last_sync_at: s.last_sync_at,
      connected: s.connected,
      fresh: s.index_fresh,
    }))
    .sort((a, b) => {
      if (!a.last_sync_at && !b.last_sync_at) return 0;
      if (!a.last_sync_at) return 1;
      if (!b.last_sync_at) return -1;
      return new Date(b.last_sync_at).getTime() - new Date(a.last_sync_at).getTime();
    });

  const recentActivity = [...activity]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  return { sources, recent_activity: recentActivity };
}

export function computeAssessment(
  facts: CaseFactSummary,
  gaps: CaseGapSummary,
  risks: CaseRiskIndicator[],
  freshness: CaseFreshnessSummary,
  engineReachable: boolean,
): CaseAssessment {
  if (!engineReachable) return "unknown";

  let score = 100;

  // Deduct for gaps
  score -= gaps.critical * 25;
  score -= gaps.high * 15;
  score -= gaps.medium * 5;
  score -= gaps.low * 1;

  // Deduct for risks
  for (const risk of risks) {
    if (risk.level === "critical") score -= 20;
    else if (risk.level === "high") score -= 10;
    else if (risk.level === "medium") score -= 5;
    else if (risk.level === "low") score -= 2;
  }

  // Deduct for low confidence facts
  if (facts.total > 0) {
    const lowRatio = facts.low_confidence / facts.total;
    score -= Math.round(lowRatio * 15);
  }

  // Deduct for contradicted facts
  score -= facts.contradicted * 5;

  // Deduct for stale sources
  if (freshness.stale_sources > 0) {
    score -= Math.min(freshness.stale_sources * 3, 15);
  }

  // Deduct for error sources
  score -= freshness.error_sources * 5;

  // Deduct for low completeness
  if (freshness.completeness_score < 0.5) {
    score -= Math.round((0.5 - freshness.completeness_score) * 40);
  }

  // Deduct for no facts (can't understand a case with zero facts)
  if (facts.total === 0) {
    score -= 30;
  }

  // Deduct for no sources (no data at all)
  if (freshness.fresh_sources === 0 && freshness.stale_sources === 0) {
    score -= 20;
  }

  score = Math.max(0, Math.min(100, score));

  if (score >= 75) return "well_understood";
  if (score >= 50) return "partially_understood";
  return "poorly_understood";
}

export function buildCaseUnderstoodPanel(bundle: MatterContextBundle): CaseUnderstoodPanel {
  const facts = buildFactSummary(bundle.facts);
  const gaps = buildGapSummary(bundle.gaps);
  const risks = buildRiskIndicators(bundle);
  const freshness = buildFreshnessSummary(bundle.coverage, bundle.recent_activity);
  const recent_sources = buildRecentSourcesSummary(bundle.coverage, bundle.recent_activity);
  const overall_assessment = computeAssessment(
    facts,
    gaps,
    risks,
    freshness,
    bundle.engine_reachable,
  );

  return {
    case_slug: bundle.case_slug,
    case_title: bundle.case_title,
    case_number: bundle.case_number,
    status: bundle.status,
    generated_at: bundle.generated_at,
    facts,
    gaps,
    risks,
    freshness,
    recent_sources,
    overall_assessment,
  };
}
