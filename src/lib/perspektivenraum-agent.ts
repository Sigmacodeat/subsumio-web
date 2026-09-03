/**
 * Perspektivenraum-Agent — grounded multi-role adversarial reasoning.
 *
 * Runs the same matter record through role-conditioned prompts (Richter,
 * Gegenanwalt, Mandant, and — only where the proceeding type actually has
 * one — Geschworene/Schöffen) instead of a single strategy pass. Each
 * role's output text is grounded independently by the caller via
 * useGroundedAnswer + CitationPanel; this module only builds prompts and
 * parses model output, it does not perform or verify grounding itself.
 *
 * Deliberately qualitative-only: no settlement ranges or win probabilities
 * are fabricated here. A quantitative layer only belongs on top of real
 * historical base rates (src/lib/litigation-analytics.ts) and is out of
 * scope for this pass — see the Perspektivenraum blueprint's Phase 2.
 */

export type PerspektivenRole = "richter" | "gegenanwalt" | "mandant" | "geschworene";

export interface PerspektivenDials {
  evidenceStrength: "schwach" | "neutral" | "stark";
  opponentPosture: "kompromissbereit" | "hart";
  timePressure: "entspannt" | "eng";
}

export interface PerspektivenRoleInput {
  role: PerspektivenRole;
  caseTitle: string;
  caseFacts: string;
  caseClaims: string;
  caseDefenses: string;
  legalArea: string;
  dials: PerspektivenDials;
}

export interface PerspektivenRoleOutput {
  role: PerspektivenRole;
  headline: string;
  analysis: string;
  key_points: string[];
}

export interface PerspektivenSession {
  id: string;
  case_slug: string;
  dials: PerspektivenDials;
  roles: PerspektivenRoleOutput[];
  created_at: string;
}

const ROLE_LABELS: Record<PerspektivenRole, string> = {
  richter: "Richter/Spruchkörper",
  gegenanwalt: "Gegenanwalt",
  mandant: "Mandant",
  geschworene: "Geschworene/Schöffen",
};

const ROLE_INSTRUCTIONS: Record<PerspektivenRole, string> = {
  richter:
    "Du bist ein erfahrener Richter/Spruchkörper. Wende die einschlägigen rechtlichen Maßstäbe an, markiere Schwachstellen der vorgetragenen Position und zitiere, wo möglich, einschlägige Normen oder Rechtsprechung aus dem Korpus. Bewerte streng nach Recht, nicht nach Sympathie.",
  gegenanwalt:
    "Du bist der Gegenanwalt. Greife die vorgetragene Position an: Gegenargumente, verfahrensrechtliche Angriffspunkte, Lücken in der Beweisführung. Sei so hart, wie ein realer Gegner es wäre.",
  mandant:
    "Du bist der Mandant selbst — kein Jurist. Bewerte aus Sicht von Vergleichsbereitschaft, Kostenempfindlichkeit und Risikotoleranz. Was würde dich nervös machen, was würde dich zu einem Vergleich bewegen?",
  geschworene:
    "Du bist ein Geschworenen-/Schöffengremium. Bewerte die narrative Überzeugungskraft und Glaubwürdigkeit — nicht die rechtliche Subsumtion. Wo verliert die Geschichte den Zuhörer, wo überzeugt sie?",
};

function dialHints(dials: PerspektivenDials): string {
  const evidence = { schwach: "schwach", neutral: "durchschnittlich", stark: "stark" }[
    dials.evidenceStrength
  ];
  const posture = {
    kompromissbereit: "kompromissbereit",
    hart: "hart, kaum verhandlungsbereit",
  }[dials.opponentPosture];
  const time = { entspannt: "kein akuter Zeitdruck", eng: "enger Zeitrahmen/nahende Frist" }[
    dials.timePressure
  ];
  return `Angenommene Rahmenbedingungen für diese Analyse (vom Anwalt gesetzt, keine Tatsachenfeststellung): Beweislage ${evidence}. Haltung der Gegenseite: ${posture}. Zeitdruck: ${time}.`;
}

export function createPerspektivenPrompt(input: PerspektivenRoleInput): string {
  return [
    ROLE_INSTRUCTIONS[input.role],
    "",
    `Akte: ${input.caseTitle}`,
    `Rechtsgebiet: ${input.legalArea || "Allgemein"}`,
    "",
    "Sachverhalt:",
    input.caseFacts || "(keine Angabe)",
    "",
    "Ansprüche:",
    input.caseClaims || "(keine Angabe)",
    "",
    "Verteidigung:",
    input.caseDefenses || "(keine Angabe)",
    "",
    dialHints(input.dials),
    "",
    "Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown, keine Prozentzahlen/Wahrscheinlichkeiten — nur Einschätzung in Worten):",
    '{"headline": "Ein-Satz-Kernaussage aus dieser Rolle", "analysis": "3-5 Sätze Analyse, mit Verweisen auf Aktenstellen/Normen wo möglich", "key_points": ["Stichpunkt 1", "Stichpunkt 2"]}',
  ].join("\n");
}

export function parsePerspektivenOutput(
  rawOutput: string,
  role: PerspektivenRole
): PerspektivenRoleOutput {
  try {
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawOutput);
    return {
      role,
      headline: String(parsed.headline ?? ROLE_LABELS[role]),
      analysis: String(parsed.analysis ?? rawOutput.slice(0, 800)),
      key_points: Array.isArray(parsed.key_points)
        ? parsed.key_points.map((p: unknown) => String(p))
        : [],
    };
  } catch {
    return {
      role,
      headline: ROLE_LABELS[role],
      analysis: rawOutput.slice(0, 800),
      key_points: [],
    };
  }
}

export function roleLabel(role: PerspektivenRole): string {
  return ROLE_LABELS[role];
}

// Geschworene/Schöffen only sit on jury-eligible proceedings — essentially
// never in DE/AT civil or ordinary commercial matters. Heuristic gate on
// the case's legal_area/court fields; defaults to false, i.e. no fabricated
// jury panel for matter types that would never see one. This is the
// deliberate DACH correction vs. a generic "Jury" role for every case.
const JURY_ELIGIBLE_PATTERN = /schwurgericht|geschworenengericht/i;

export function isJuryEligible(fields: { legalArea?: string; court?: string }): boolean {
  const haystack = `${fields.legalArea ?? ""} ${fields.court ?? ""}`;
  return JURY_ELIGIBLE_PATTERN.test(haystack);
}

export const DEFAULT_DIALS: PerspektivenDials = {
  evidenceStrength: "neutral",
  opponentPosture: "hart",
  timePressure: "entspannt",
};

export const BASE_ROLES: PerspektivenRole[] = ["richter", "gegenanwalt", "mandant"];
