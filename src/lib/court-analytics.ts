/**
 * Entscheider-Analytics — Judgement-based Court Analytics
 * =========================================================
 * Aggregation over judgements DB (court/chamber: duration, outcome, citation frequency).
 * Only published decisions, opt-in flag in settings, disclaimer required in UI.
 * NO individual judge profiles without legal review (config switch judge_level: false default).
 */

export interface CourtAnalytics {
  court: string;
  chamber?: string;
  total_decisions: number;
  avg_duration_days: number;
  outcome_distribution: {
    plaintiff_wins: number;
    defendant_wins: number;
    partial: number;
    other: number;
  };
  citation_frequency: number;
  top_legal_areas: Array<{ area: string; count: number }>;
}

export interface AnalyticsConfig {
  opt_in: boolean;
  judge_level: boolean;
  disclaimer_shown: boolean;
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  opt_in: false,
  judge_level: false,
  disclaimer_shown: false,
};

export const ANALYTICS_DISCLAIMER_DE =
  "Die hier gezeigten Statistiken basieren auf veröffentlichten Gerichtsentscheidungen und stellen keine Rechtsberatung dar. " +
  "Aussagen über einzelne Richter:innen sind deaktiviert und werden erst nach rechtlicher Prüfung freigeschaltet.";

export function aggregateCourtAnalytics(
  judgements: Array<{
    court: string;
    chamber?: string;
    duration_days?: number;
    outcome?: string;
    citation_count?: number;
    legal_area?: string;
  }>
): CourtAnalytics[] {
  const groups = new Map<string, typeof judgements>();

  for (const j of judgements) {
    const key = j.chamber ? `${j.court} - ${j.chamber}` : j.court;
    const existing = groups.get(key) ?? [];
    existing.push(j);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([key, items]) => {
    const durations = items
      .map((i) => i.duration_days)
      .filter((d): d is number => d !== undefined && d > 0);
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    const outcomeDist = {
      plaintiff_wins: items.filter((i) => i.outcome === "plaintiff_wins").length,
      defendant_wins: items.filter((i) => i.outcome === "defendant_wins").length,
      partial: items.filter((i) => i.outcome === "partial").length,
      other: items.filter(
        (i) => i.outcome && !["plaintiff_wins", "defendant_wins", "partial"].includes(i.outcome)
      ).length,
    };

    const citations = items.reduce((sum, i) => sum + (i.citation_count ?? 0), 0);

    const areaMap = new Map<string, number>();
    for (const i of items) {
      if (i.legal_area) {
        areaMap.set(i.legal_area, (areaMap.get(i.legal_area) ?? 0) + 1);
      }
    }
    const topAreas = Array.from(areaMap.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const [court, chamber] = key.includes(" - ") ? key.split(" - ") : [key, undefined];

    return {
      court: court!,
      chamber,
      total_decisions: items.length,
      avg_duration_days: avgDuration,
      outcome_distribution: outcomeDist,
      citation_frequency: citations,
      top_legal_areas: topAreas,
    };
  });
}
