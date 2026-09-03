/**
 * Case Investigation Suggestion — proaktive Copilot-Empfehlung.
 *
 * Der Copilot hat MatterContextBundle und empfiehlt die Sachverhaltsprüfung,
 * wenn die Indikatorenlage stimmt (≥ 2 Indikatoren). Kontextbewusst, nicht
 * keyword-basiert — der Copilot kennt Parteien, Rollen, bekannte Widersprüche.
 *
 * Architektur: Zwei-Phasen-Trennung (Extraction beim Upload isoliert,
 * Analysis on-demand). Diese Lib entscheidet nur, OB empfohlen wird —
 * die Analysis läuft in der Engine (Phase 2).
 *
 * Siehe docs/blueprints/CASE-INVESTIGATION.md.
 */

import type {
  MatterContextBundle,
  CaseInvestigationSuggestion,
  CaseInvestigationSuggestionIndicators,
} from "@/lib/matter-context-types";

/** Mindestanzahl ready-Dokumente für eine sinnvolle Analyse. */
const MIN_READY_DOCUMENTS = 5;

/** Mindestanzahl Indikatoren, die zutreffen müssen, damit empfohlen wird. */
const MIN_INDICATORS = 2;

/** Geschätzte Credits pro Analyse (subsumption-Tier). */
const ESTIMATED_CREDITS = 2;

/** Geschätzte Dauer in Sekunden (typischer Zivilakt 200–800 S.). */
const ESTIMATED_DURATION_SECONDS = 45;

/**
 * Berechnet die Indikatoren aus einem MatterContextBundle.
 * Reine Funktion — testbar ohne Engine oder Netzwerk.
 */
export function computeInvestigationIndicators(
  bundle: MatterContextBundle
): CaseInvestigationSuggestionIndicators {
  const hasOpposingParties =
    bundle.parties.some((p) => p.role === "client") &&
    bundle.parties.some((p) => p.role === "opponent");

  const knownContradictions = bundle.facts.filter(
    (f) => Array.isArray(f.contradicts) && f.contradicts.length > 0
  ).length;

  const readyDocuments = bundle.documents.filter((d) => d.analysis_status === "completed").length;

  const hasGaps = bundle.gaps.length > 0;
  const hasCommunication = bundle.communications.length > 0;

  return {
    has_opposing_parties: hasOpposingParties,
    known_contradictions: knownContradictions,
    ready_documents: readyDocuments,
    has_gaps: hasGaps,
    has_communication: hasCommunication,
  };
}

/**
 * Zählt, wie viele Indikatoren zutreffen.
 */
export function countActiveIndicators(indicators: CaseInvestigationSuggestionIndicators): number {
  let count = 0;
  if (indicators.has_opposing_parties) count++;
  if (indicators.known_contradictions > 0) count++;
  if (indicators.ready_documents >= MIN_READY_DOCUMENTS) count++;
  if (indicators.has_gaps) count++;
  if (indicators.has_communication) count++;
  return count;
}

/**
 * Bestimmt die Dringlichkeit aus der Indikatorenlage.
 *
 * - high:   bekannte Widersprüche + genug Dokumente + Parteien vorhanden
 * - medium: ≥ 2 Indikatoren, aber nicht alle Kriterien für high
 * - low:    nur knapp über Schwelle
 */
export function computeUrgency(
  indicators: CaseInvestigationSuggestionIndicators,
  activeCount: number
): "low" | "medium" | "high" {
  const hasStrongSignal =
    indicators.known_contradictions > 0 &&
    indicators.ready_documents >= MIN_READY_DOCUMENTS &&
    indicators.has_opposing_parties;

  if (hasStrongSignal) return "high";
  if (activeCount >= 3) return "medium";
  return "low";
}

/**
 * Erzeugt eine kontextbewusste Begründung für die Empfehlung.
 * Parteienbezogen formuliert („Müller behauptet X, Huber behauptet Y"),
 * nicht abstrakt.
 */
export function buildSuggestionReason(
  bundle: MatterContextBundle,
  indicators: CaseInvestigationSuggestionIndicators
): string {
  const client = bundle.parties.find((p) => p.role === "client");
  const opponent = bundle.parties.find((p) => p.role === "opponent");
  const partyLabel = client && opponent ? `${client.name} vs. ${opponent.name}` : bundle.case_title;

  const parts: string[] = [`Fall **${partyLabel}**:`];

  if (indicators.ready_documents > 0) {
    parts.push(`${indicators.ready_documents} analysierte Dokumente`);
  }
  if (indicators.known_contradictions > 0) {
    parts.push(
      `${indicators.known_contradictions} ${
        indicators.known_contradictions === 1
          ? "bereits bekannte Widerspruchs-Referenz"
          : "bereits bekannte Widerspruchs-Referenzen"
      }`
    );
  }
  if (indicators.has_gaps) {
    parts.push(
      `${bundle.gaps.length} ${bundle.gaps.length === 1 ? "Beweislücke" : "Beweislücken"}`
    );
  }
  if (indicators.has_communication) {
    parts.push("Kommunikation zwischen Parteien vorhanden");
  }
  if (indicators.has_opposing_parties) {
    parts.push("kontradiktorische Parteienlage");
  }

  const summary = parts.slice(1).join(", ");
  return summary
    ? `${parts[0]} ${summary}.`
    : `${parts[0]} unzureichende Datenlage für eine Analyse.`;
}

/**
 * Hauptfunktion: entscheidet, ob der Copilot die Sachverhaltsprüfung
 * proaktiv empfehlen soll.
 *
 * Empfohlen wird, wenn:
 * - genug ready-Dokumente vorhanden sind (≥ MIN_READY_DOCUMENTS), UND
 * - mindestens MIN_INDICATORS Indikatoren zutreffen.
 *
 * Fail-closed: bei Engine nicht erreichbar oder leerem Bundle → keine
 * Empfehlung (keine suggestive Empfehlung auf dünner Datenlage).
 */
export function shouldSuggestInvestigation(
  bundle: MatterContextBundle
): CaseInvestigationSuggestion {
  const indicators = computeInvestigationIndicators(bundle);
  const activeCount = countActiveIndicators(indicators);
  const urgency = computeUrgency(indicators, activeCount);
  const reason = buildSuggestionReason(bundle, indicators);

  const enoughDocuments = indicators.ready_documents >= MIN_READY_DOCUMENTS;
  const enoughIndicators = activeCount >= MIN_INDICATORS;
  const engineOk = bundle.engine_reachable;

  const suggest = enoughDocuments && enoughIndicators && engineOk;

  return {
    suggest,
    reason,
    urgency: suggest ? urgency : "low",
    indicators,
    estimated_credits: ESTIMATED_CREDITS,
    estimated_duration_seconds: ESTIMATED_DURATION_SECONDS,
    case_slug: bundle.case_slug,
    case_title: bundle.case_title,
  };
}
