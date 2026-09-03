/**
 * Query Complexity Router — v0.43.x
 *
 * Pre-routes user queries to the appropriate workflow based on complexity.
 * Simple queries ("Wann ist die Frist?") → quick workflow (fewer layers).
 * Complex queries ("Schadensersatzanalyse mit 3 Parteien") → full pipeline.
 *
 * Inspired by RouteLLM (2024) — 85% cost reduction by routing simple
 * queries to cheaper paths. Our routing is at the WORKFLOW level (which
 * layers to run), not the model level (which model to use).
 *
 * Classification signals:
 *   - Query length (short = simple)
 *   - Number of legal concepts mentioned
 *   - Presence of temporal/deadline keywords → fristen_report
 *   - Presence of drafting keywords → schriftsatz
 *   - Presence of multi-party/multi-claim keywords → full_pipeline
 *   - Explicit user request for depth → full_pipeline
 */

export type ComplexityTier = "quick" | "memo" | "fristen_report" | "schriftsatz" | "full_pipeline";

export interface ComplexityClassification {
  tier: ComplexityTier;
  confidence: number; // 0-1
  signals: string[];
  reasoning: string;
}

// ── Signal Patterns ──────────────────────────────────────────

const DEADLINE_KEYWORDS = [
  "frist",
  "fristen",
  "verjährung",
  "verjährt",
  "hemmung",
  "unterbrechung",
  "deadline",
  "fällig",
  "zustellung",
  "zugestellt",
  "beginn der frist",
  "fristbeginn",
  "fristende",
  "notfrist",
  "einspruchsfrist",
];

const DRAFTING_KEYWORDS = [
  "schriftsatz",
  "klage",
  "klageschrift",
  "antwort",
  "klageantwort",
  "berufung",
  "revision",
  "einspruch",
  "widerspruch",
  "replik",
  "duplik",
  "memorandum",
  "memo",
  "gutachten",
  "entwurf",
  "draft",
  "verfassen",
  "abfassen",
];

const COMPLEXITY_KEYWORDS = [
  "mehrere parteien",
  "mehrparteien",
  "streitgenossen",
  "haftung",
  "schadensersatz",
  "schmerzensgeld",
  "unterlassung",
  "feststellung",
  "gestaltung",
  "widerklage",
  "aufrechnung",
  "zurückbehaltung",
  "haftungsausschluss",
  "mitverschulden",
  "unterbrechung",
  "mehrfach",
  "komplex",
  "umfassend",
  "detailliert",
  "alle aspekte",
  "vollständige analyse",
];

const QUICK_PATTERNS = [
  /^(wann|was ist|ist|gilt|wie lautet)\s+(die|der|ein|eine)?\s*(frist|§|paragraph|gesetz)/i,
  /^(wann)\s+(ist|läuft|endet)\s+(die|eine)?\s*frist/i,
  /^(was)\s+(besagt|ist)\s+(§|art\.|artikel)/i,
  /^(ist)\s+(die|eine)\s+frist.*verjährt/i,
];

// ── Classifier ───────────────────────────────────────────────

/**
 * Classify a user query into a complexity tier.
 * Returns the tier, confidence, and signals that drove the decision.
 */
export function classifyQueryComplexity(
  query: string,
  documentCount: number = 0
): ComplexityClassification {
  const signals: string[] = [];
  const queryLower = query.toLowerCase().trim();
  const queryLength = query.length;

  // Signal 1: Quick patterns (regex match)
  for (const pattern of QUICK_PATTERNS) {
    if (pattern.test(queryLower)) {
      signals.push("quick_pattern_match");
      return {
        tier: "quick",
        confidence: 0.85,
        signals,
        reasoning: `Query matches quick pattern (${pattern.source}). Single-concept lookup, no multi-party analysis needed.`,
      };
    }
  }

  // Signal 2: Deadline keywords → fristen_report
  const deadlineHits = DEADLINE_KEYWORDS.filter((k) => queryLower.includes(k));
  if (deadlineHits.length >= 2) {
    signals.push(`deadline_keywords: ${deadlineHits.slice(0, 3).join(", ")}`);
    return {
      tier: "fristen_report",
      confidence: 0.8,
      signals,
      reasoning: `Multiple deadline-related keywords detected. Fristen-Report workflow is optimal for deadline calculation + risk analysis.`,
    };
  }

  // Signal 3: Drafting keywords → schriftsatz
  // Use word-boundary matching to avoid false positives (e.g. "klage" in "Widerklage")
  const draftingHits = DRAFTING_KEYWORDS.filter((k) => {
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(queryLower);
  });
  if (draftingHits.length >= 1) {
    signals.push(`drafting_keywords: ${draftingHits.slice(0, 3).join(", ")}`);
    return {
      tier: "schriftsatz",
      confidence: 0.85,
      signals,
      reasoning: `Drafting request detected. Schriftsatz workflow produces structured legal documents with source citations.`,
    };
  }

  // Signal 4: Complexity keywords → full_pipeline
  const complexityHits = COMPLEXITY_KEYWORDS.filter((k) => queryLower.includes(k));
  if (complexityHits.length >= 2) {
    signals.push(`complexity_keywords: ${complexityHits.slice(0, 3).join(", ")}`);
    return {
      tier: "full_pipeline",
      confidence: 0.75,
      signals,
      reasoning: `Multiple complexity indicators (multi-party, multiple legal concepts). Full pipeline needed for comprehensive analysis.`,
    };
  }

  // Signal 5: Document count — many documents → full_pipeline
  if (documentCount > 50) {
    signals.push(`document_count: ${documentCount} (>50)`);
    return {
      tier: "full_pipeline",
      confidence: 0.7,
      signals,
      reasoning: `Large document set (${documentCount} pages) requires full pipeline for comprehensive analysis.`,
    };
  }

  // Signal 6: Very short query with single concept → quick
  if (queryLength < 80 && complexityHits.length === 0 && deadlineHits.length === 0) {
    signals.push(`short_query: ${queryLength} chars`);
    signals.push("no_complexity_keywords");
    return {
      tier: "quick",
      confidence: 0.65,
      signals,
      reasoning: `Short query (${queryLength} chars) with no complexity/deadline/drafting keywords. Quick workflow suffices.`,
    };
  }

  // Signal 7: Medium query → memo
  if (queryLength < 300) {
    signals.push(`medium_query: ${queryLength} chars`);
    return {
      tier: "memo",
      confidence: 0.6,
      signals,
      reasoning: `Medium-length query. Memo workflow provides structured answer with §-sources and counterarguments.`,
    };
  }

  // Default: full_pipeline for long, complex queries
  signals.push(`long_query: ${queryLength} chars`);
  return {
    tier: "full_pipeline",
    confidence: 0.55,
    signals,
    reasoning: `Long query (${queryLength} chars). Full pipeline for comprehensive analysis.`,
  };
}

/**
 * Map complexity tier to workflow ID.
 *
 * F13 fix: "quick" used to map to "memo" — the SAME nine-layer workflow
 * (including opponent-simulator + 3-model ensemble critic) as every other
 * memo request, on the theory that "memo already has a reduced layer set."
 * It doesn't; memo is the second-heaviest workflow after full_pipeline. A
 * genuinely narrow question ("Wann verjährt X?") now routes to the real
 * lightweight "quick_answer" workflow (server/src/core/minions/workflow-defs.ts).
 */
export function tierToWorkflowId(
  tier: ComplexityTier
): "quick_answer" | "memo" | "fristen_report" | "schriftsatz" | "full_pipeline" {
  switch (tier) {
    case "quick":
      return "quick_answer";
    case "memo":
      return "memo";
    case "fristen_report":
      return "fristen_report";
    case "schriftsatz":
      return "schriftsatz";
    case "full_pipeline":
      return "full_pipeline";
  }
}
