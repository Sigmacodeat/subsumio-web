/**
 * Quellendeckung (Groundedness) — heuristische Einordnung, wie stark eine
 * KI-Antwort durch eigene Brain-Quellen belegt ist.
 *
 * EHRLICHKEITSREGEL: Das misst Quellen-BELEGUNG, NICHT inhaltliche Richtigkeit.
 * Eine „gut gestützte" Antwort kann falsch sein; eine „ungestützte" kann
 * stimmen. Der Wert ist ein Vorsicht-Signal gegen Halluzination, keine
 * Korrektheits-Garantie — immer fachlich prüfen. (Hintergrund: Stanford-RegLab-
 * Befund, dass auch Legal-AI-Tools mit Quellen halluzinieren.)
 */

export type GroundLevel = "high" | "partial" | "low";

export interface Groundedness {
  level: GroundLevel;
  label: string;
  /** Tailwind-Klassen für den Badge (text/bg/border zusammen). */
  cls: string;
  /** Kurzerklärung für Tooltip + aria-label. */
  hint: string;
  citationCount: number;
  gapCount: number;
}

/**
 * Leitet die Quellendeckung aus den Zitaten + gemeldeten Lücken einer Antwort ab.
 * Rein funktional, damit testbar und seitenübergreifend wiederverwendbar.
 */
export function assessGroundedness(
  citations: { slug: string }[] | undefined,
  gaps: string[] | undefined,
): Groundedness {
  const citationCount = citations?.length ?? 0;
  const gapCount = gaps?.length ?? 0;

  if (citationCount === 0) {
    return {
      level: "low",
      label: "Ungestützt",
      cls: "text-red-400 bg-red-500/10 border-red-500/30",
      hint: "Keine eigenen Brain-Quellen belegen diese Antwort — erhöhtes Halluzinations-Risiko. Inhalt zwingend fachlich prüfen.",
      citationCount,
      gapCount,
    };
  }
  if (gapCount > 0) {
    return {
      level: "partial",
      label: "Teilweise gestützt",
      cls: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      hint: `${citationCount} Brain-Quelle(n) belegen die Antwort, aber das Brain meldet ${gapCount} Lücke(n) — kann unvollständig sein. Misst Belegung, nicht Richtigkeit.`,
      citationCount,
      gapCount,
    };
  }
  return {
    level: "high",
    label: "Gut gestützt",
    cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    hint: `${citationCount} eigene Brain-Quelle(n) belegen diese Antwort, keine gemeldeten Lücken. Misst Quellen-Belegung, nicht inhaltliche Richtigkeit — fachlich prüfen.`,
    citationCount,
    gapCount,
  };
}
