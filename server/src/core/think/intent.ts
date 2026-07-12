/**
 * v0.40.2.0 — Pure intent classifier for `gbrain think` trajectory routing.
 *
 * Regex-first (no LLM call) so the fast path adds zero latency on the
 * common "other" intent. Three buckets:
 *   - 'temporal':         "when did I last...", "how long ago...", date markers
 *   - 'knowledge_update': "X changed/switched/moved/no longer..."
 *   - 'other':            everything else (no trajectory injection)
 *
 * The classifier deliberately errs toward 'other' — false positives would
 * waste prompt tokens on irrelevant trajectory blocks; false negatives just
 * mean a few questions miss the trajectory boost. Recall over precision is
 * NOT the right tradeoff at this surface.
 *
 * Sibling shape lives at `src/eval/longmemeval/intent.ts` and prefers the
 * dataset's `question_type` field before falling back to this same regex
 * set. Both classifiers MUST agree on edge cases — the regex literals here
 * are the single source of truth.
 */

export type Intent = "temporal" | "knowledge_update" | "other";

// Compiled once at module load.
const TEMPORAL_RX = new RegExp(
  [
    // Question-word triggers
    "\\bwhen\\b",
    "\\bhow\\s+long\\s+ago\\b",
    "\\bhow\\s+long\\s+(have|has|did|do)\\b",
    // Recency markers
    "\\blast\\s+(time|met|saw|spoke|visited)\\b",
    "\\b(is\\s+)?still\\b",
    "\\bcurrent(?:ly)?\\b",
    "\\bnow\\b",
    // Temporal prepositions with date-shaped context
    "\\bbefore\\s+(I|we|the|that)\\b",
    "\\bafter\\s+(I|we|the|that)\\b",
    "\\bsince\\s+(when|I|we|the|last|\\d{4})\\b",
    // Explicit date markers
    "\\b(20\\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b",
  ].join("|"),
  "i"
);

const KNOWLEDGE_UPDATE_RX = new RegExp(
  [
    // Supersession verbs — explicit signal that something changed.
    // Verb-stem + optional inflection suffix (d|ed|s|es|ing) so
    // "switch", "switched", "switches", "switching" all match.
    "\\b(?:chang|switch|mov|updat)(?:e[ds]?|ed|es|ing)?\\b",
    "\\bno\\s+longer\\b",
    "\\binstead\\s+of\\b",
    "\\bused\\s+to\\b",
    "\\b(?:they|he|she|we|I)\\s+stopped\\b",
    // Phrasing for "what is the current/latest X"
    "\\b(current|latest|new|most\\s+recent)\\s+\\w+",
    "\\bwhat(?:'s|\\s+is)\\s+(?:the\\s+)?(?:current|latest|new)\\b",
  ].join("|"),
  "i"
);

/**
 * Classify a question into one of the three intents. Knowledge-update
 * patterns win over temporal when both match — the supersession framing
 * is a more specific signal (every supersession question is also temporal,
 * but trajectory's `(superseded prior)` annotation is the knowledge_update
 * differentiator).
 */
export function classifyIntent(question: string): Intent {
  if (typeof question !== "string" || question.length === 0) return "other";
  if (KNOWLEDGE_UPDATE_RX.test(question)) return "knowledge_update";
  if (TEMPORAL_RX.test(question)) return "temporal";
  return "other";
}

// ─────────────────────────────────────────────────────────────────
// Legal complexity classification for intent-specific model routing.
// Complex questions → deep tier (Grok 4.3, Claude Opus)
// Simple questions → reasoning tier (DeepSeek V4 Flash)
// ─────────────────────────────────────────────────────────────────

export type LegalComplexity = "simple" | "moderate" | "complex";

// Complex: subsumption, cross-law analysis, definition derivation, multi-party
const COMPLEX_RX = new RegExp(
  [
    // Subsumption / application requests
    "\\bsubsum\\w*\\b",
    "\\banwend\\w*\\b",
    "\\bpruef\\w*\\b",
    "\\bprüf\\w*\\b",
    // Cross-law / multi-statute
    "\\bvergleich\\w*\\b.*\\b(?:mit|und)\\b.*\\b(?:BGB|ABGB|StGB|HGB|ZPO|AO|OR|ZGB)\\b",
    "\\b(?:BGB|ABGB|StGB|HGB|ZPO|AO|OR|ZGB)\\b.*\\b(?:und|mit|gegen)\\b.*\\b(?:BGB|ABGB|StGB|HGB|ZPO|AO|OR|ZGB)\\b",
    // Definition / interpretation requests
    "\\bdefini\\w*\\b",
    "\\bausleg\\w*\\b",
    "\\binterpret\\w*\\b",
    "\\bbedeut\\w*\\b",
    // Multi-party / complex scenario
    "\\bmehrere\\b.*\\b(?:Parteien|Schuldner|Glaeubiger|Gläubiger)\\b",
    "\\bTatbestand\\b",
    // Constitutional / fundamental rights
    "\\bGrundrecht\\w*\\b",
    "\\bVerfass\\w*\\b",
    // Procedural complexity
    "\\bRechtsmittel\\b",
    "\\bBerufung\\b",
    "\\bRevision\\b",
    "\\bBeschwerde\\b",
  ].join("|"),
  "i"
);

// Moderate: specific §-lookup, single-law question
const MODERATE_RX = new RegExp(
  [
    "§\\s*\\d+",
    "\\b(?:Absatz|Abs)\\.?\\s*\\d+",
    "\\b(?:Satz|S)\\.?\\s*\\d+",
    "\\b(?:BGB|ABGB|StGB|HGB|ZPO|AO|OR|ZGB|UWG|GmbHG|StPO|DSG)\\b",
    "\\bFrist\\b",
    "\\bVerjaehrung\\b",
    "\\bVerjährung\\b",
    "\\bSchadensersatz\\b",
    "\\bVertrag\\b",
    "\\bKauf\\b",
    "\\bMiete\\b",
    "\\bKuendigung\\b",
    "\\bKündigung\\b",
  ].join("|"),
  "i"
);

/**
 * Classify a legal question's complexity for model routing.
 *
 * - "complex": Subsumption, cross-law analysis, definition derivation,
 *   constitutional questions, procedural appeals → deep tier (Grok 4.3)
 * - "moderate": Specific §-lookup, single-law questions → reasoning tier
 * - "simple": General legal questions, no §-references → reasoning tier
 */
export function classifyLegalComplexity(question: string): LegalComplexity {
  if (typeof question !== "string" || question.length === 0) return "simple";
  if (COMPLEX_RX.test(question)) return "complex";
  if (MODERATE_RX.test(question)) return "moderate";
  return "simple";
}

/**
 * Map complexity to model tier for routing.
 * Complex → "deep" (Grok 4.3, Claude Opus)
 * Moderate → "reasoning" (DeepSeek V4 Flash)
 * Simple → "reasoning" (DeepSeek V4 Flash)
 */
export function complexityToTier(complexity: LegalComplexity): "deep" | "reasoning" {
  return complexity === "complex" ? "deep" : "reasoning";
}
