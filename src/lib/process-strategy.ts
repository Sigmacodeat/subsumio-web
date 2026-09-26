/** Process strategy (SWOT) as parsed from the AI answer — nothing invented. */

export interface StrategyResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  recommendedActions: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    rationale: string;
  }>;
  evidenceGaps: string[];
  /** null: the AI answer had no usable risk rating — never invented. */
  riskAssessment: {
    overall: "low" | "medium" | "high";
    factors: string[];
  } | null;
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Only what the model actually delivered; a missing rating stays missing. */
export function normalizeStrategy(
  raw: Record<string, unknown>,
  fallbackSummary: string
): StrategyResult {
  const risk = raw.riskAssessment as { overall?: unknown; factors?: unknown } | undefined;
  const overall =
    risk && (risk.overall === "low" || risk.overall === "medium" || risk.overall === "high")
      ? risk.overall
      : null;
  return {
    summary: typeof raw.summary === "string" && raw.summary ? raw.summary : fallbackSummary,
    strengths: strList(raw.strengths),
    weaknesses: strList(raw.weaknesses),
    opportunities: strList(raw.opportunities),
    threats: strList(raw.threats),
    recommendedActions: Array.isArray(raw.recommendedActions)
      ? (raw.recommendedActions as StrategyResult["recommendedActions"])
      : [],
    evidenceGaps: strList(raw.evidenceGaps),
    riskAssessment: overall ? { overall, factors: strList(risk?.factors) } : null,
  };
}
