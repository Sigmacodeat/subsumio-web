/**
 * Red-Team-Agent — Adversarial Legal Reasoning
 * =============================================
 * Takes a drafting draft + case context, argues the opposing position
 * with grounding against the judgements corpus.
 * Output: annotation list for the strategy tab (insight card type "red_team").
 * Approval-free (read-only), budget-capped.
 */

export interface RedTeamInput {
  case_slug: string;
  draft_slug?: string;
  draft_text: string;
  case_context: string;
  legal_area?: string;
  opponent_perspective?: string;
}

export interface RedTeamAnnotation {
  id: string;
  type: "weakness" | "counterargument" | "missing_argument" | "risk" | "precedent";
  severity: "low" | "medium" | "high";
  section: string;
  annotation: string;
  suggestion?: string;
  grounded_in?: string;
}

export interface RedTeamResult {
  id: string;
  case_slug: string;
  annotations: RedTeamAnnotation[];
  overall_risk: "low" | "medium" | "high";
  summary: string;
  created_at: string;
}

export function createRedTeamPrompt(input: RedTeamInput): string {
  const parts: string[] = [
    "Du bist ein Red-Team-Agent für anwaltliches Drafting.",
    "Deine Aufgabe ist es, den Entwurf aus der Perspektive der Gegenpartei zu analysieren.",
    "Identifiziere Schwachstellen, Gegenargumente, fehlende Argumente und Risiken.",
    "Begründe jede Anmerkung mit Verweisen auf die Rechtsprechung im Korpus.",
    "",
    `Akte: ${input.case_slug}`,
    `Rechtsgebiet: ${input.legal_area ?? "Allgemein"}`,
    "",
    "Kontext:",
    input.case_context,
    "",
    "Entwurf:",
    input.draft_text,
  ];

  if (input.opponent_perspective) {
    parts.push("", "Bekannte Gegenposition:", input.opponent_perspective);
  }

  parts.push(
    "",
    "Ausgabeformat: JSON-Array von Anmerkungen mit Feldern:",
    "type (weakness|counterargument|missing_argument|risk|precedent),",
    "severity (low|medium|high), section, annotation, suggestion, grounded_in"
  );

  return parts.join("\n");
}

export function parseRedTeamOutput(rawOutput: string, caseSlug: string): RedTeamResult {
  let annotations: RedTeamAnnotation[] = [];
  try {
    const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      annotations = JSON.parse(jsonMatch[0]) as RedTeamAnnotation[];
    }
  } catch {
    annotations = [];
  }

  const highCount = annotations.filter((a) => a.severity === "high").length;
  const mediumCount = annotations.filter((a) => a.severity === "medium").length;
  const overallRisk: RedTeamResult["overall_risk"] =
    highCount >= 3 ? "high" : highCount >= 1 || mediumCount >= 3 ? "medium" : "low";

  return {
    id: `redteam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: caseSlug,
    annotations,
    overall_risk: overallRisk,
    summary: `${annotations.length} Anmerkungen (${highCount} hoch, ${mediumCount} mittel) — Gesamtrisiko: ${overallRisk}`,
    created_at: new Date().toISOString(),
  };
}
