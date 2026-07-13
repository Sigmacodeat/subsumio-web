/**
 * Citation Grounding Guardrail — Tier 0
 *
 * Deterministic, zero-cost hallucination prevention layer.
 * Checks that every citation in an LLM answer is grounded in the retrieved context.
 *
 * Architecture:
 *   Check 1: Citation Presence — every §-citation must appear in context text
 *   Check 2: Law Validation — every law abbreviation must be a known law
 *   Check 3: Non-§ Reference Grounding — EU directives, articles must be in context
 *   Check 4: Hedging Detection — detect model admitting ungrounded citations
 *   Check 5: Cross-Law Contamination — cited laws must be in retrieved results
 *
 * No LLM calls. Pure regex + string matching. O(n) in answer length.
 */

// ─── Known Laws Whitelist ─────────────────────────────────────────────────
// Built from law-corpus/de/, law-corpus/at/, law-corpus/ch/, law-corpus/eu/
// plus common German legal abbreviations that may not have corpus files.

export const KNOWN_LAWS = new Set<string>([
  // German federal laws (from law-corpus/de/)
  "AO",
  "BauGB",
  "BDSG",
  "BetrVG",
  "BewG",
  "BGB",
  "ErbStG",
  "EStG",
  "FamFG",
  "GewO",
  "GewStG",
  "GG",
  "GmbHG",
  "GrEStG",
  "HGB",
  "InsO",
  "KStG",
  "LStDV",
  "StBerG",
  "StBVV",
  "StGB",
  "StPO",
  "UrhG",
  "UStG",
  "UWG",
  "VwGO",
  "ZPO",
  "ZVG",
  // Additional common German laws not in corpus
  "GVG",
  "BauNVO",
  "BKrG",
  "BNotO",
  "BRAO",
  "DRiG",
  "EGBGB",
  "EGGVB",
  "EGZPO",
  "FKKG",
  "GKG",
  "JGG",
  "LPartG",
  "MietV",
  "PatG",
  "RBerG",
  "RVG",
  "SchKG",
  "TPG",
  "UrhG",
  "VerkG",
  "VVG",
  "ZKDG",
  // Austrian laws (from law-corpus/at/)
  "ABGB",
  "AHG",
  "AktG",
  "ALVG",
  "AMG",
  "AngG",
  "ArbVG",
  "ARG",
  "ASVG",
  "AsylG",
  "AufenthG",
  "AuslBG",
  "AVG",
  "AVRAG",
  "AWG",
  "AZG",
  "B-VG",
  "BAO",
  "BBG",
  "BDG",
  "BewG",
  "BGFA",
  "BRAG",
  "BrusselsIbis",
  "BuAG",
  "BVerGG",
  "BVG",
  "ChemG",
  "DSG",
  "ECG",
  "EheG",
  "EIWOG",
  "EO",
  "EPiG",
  "EstG",
  "EuCO",
  "ForstG",
  "FPG",
  "GebG",
  "GewO",
  "GlBG",
  "GmbHG",
  "GOG",
  "GrStG",
  "GUKG",
  "GWG",
  "IO",
  "JGG",
  "KAG",
  "KartG",
  "KSchG",
  "KStG",
  "MedienG",
  "MRG",
  "MSchG",
  "N-G",
  "OR",
  "PatG",
  "PStG",
  "RAO",
  "RoMI",
  "RoMII",
  "SchKG",
  "SMG",
  "SPG",
  "StBG",
  "StGB",
  "StPO",
  "StRegG",
  "StVO",
  "TilGG",
  "TKG",
  "TschG",
  "UGB",
  "UrhG",
  "UStG",
  "UWG",
  "VBVG",
  "VKG",
  "VStG",
  "VVG",
  "VwVG",
  "WaffG",
  "WEG",
  "WRG",
  "ZGB",
  "ZPO",
  "ZustG",
  // Swiss laws (from law-corpus/ch/)
  "BDSG",
  "BVG",
  "DSG",
  // EU laws (from law-corpus/eu/)
  "DSGVO",
  "DSRL",
  "ePrivacy",
  "BrusselsIbis",
]);

// ─── Types ────────────────────────────────────────────────────────────────

export type FlagType =
  | "ungrounded_citation"
  | "non_existent_law"
  | "fabricated_reference"
  | "hedging"
  | "cross_law_contamination"
  | "unsubstantiated_uncertainty";

export type Severity = "high" | "medium" | "low";

export interface GuardrailFlag {
  type: FlagType;
  detail: string;
  citation?: string;
  severity: Severity;
}

export interface GuardrailResult {
  passed: boolean;
  flags: GuardrailFlag[];
  // Structured details
  all_citations: string[];
  ungrounded_citations: string[];
  non_existent_laws: string[];
  fabricated_references: string[];
  hedging_phrases: string[];
  cross_law_contamination: string[];
  unsubstantiated_uncertainty_phrases: string[];
  // Citations extracted from context (allowed list)
  context_citations: string[];
  // Laws present in retrieved results
  retrieved_laws: string[];
  // Metadata
  answer_length: number;
  context_length: number;
  check_count: number;
}

// ─── Citation Extraction ──────────────────────────────────────────────────

/**
 * Extract all §-citations from text.
 * Matches: § 12 BGB, § 12 Abs. 1 BGB, § 12a HGB, §§ 12, 13 AO, § 12 Abs. 1 Satz 2 ZPO
 */
export function extractCitations(text: string): string[] {
  const citations: string[] = [];

  // Pattern: § or §§ + number(+optional letter) + optional Abs./Satz + optional law abbreviation
  const pattern =
    /§§?\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(?:Satz\s*(\d+))?\s*([A-Z][A-Za-z]{1,10})?/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const [full, num, abs, satz, law] = match;
    if (law) {
      // Reconstruct clean citation
      let cite = `§ ${num}`;
      if (abs) cite += ` Abs. ${abs}`;
      if (satz) cite += ` Satz ${satz}`;
      cite += ` ${law}`;
      citations.push(cite);
    } else {
      // § without law abbreviation — still valid if in context
      let cite = `§ ${num}`;
      if (abs) cite += ` Abs. ${abs}`;
      if (satz) cite += ` Satz ${satz}`;
      citations.push(cite);
    }
  }

  return [...new Set(citations)]; // deduplicate
}

/**
 * Extract all law abbreviations from text.
 * Looks for uppercase abbreviations 2-10 chars that follow a § or appear standalone.
 */
export function extractLawAbbreviations(text: string): string[] {
  const laws = new Set<string>();

  // Pattern 1: After § citations: "§ 12 BGB" → "BGB"
  // This is the only reliable pattern — law abbreviations after § are unambiguous
  const afterPara =
    /§§?\s*\d+[a-z]?\s*(?:Abs\.\s*\d+)?\s*(?:Satz\s*\d+)?\s*([A-Z][A-Za-z]{1,10})\b/g;
  let m: RegExpExecArray | null;
  while ((m = afterPara.exec(text)) !== null) {
    laws.add(m[1]);
  }

  // Pattern 2: Explicit law references in parentheses: "(BGB)", "(AO)"
  // These are reliable because the parentheses signal an abbreviation
  const parenLaw = /\(([A-Z][A-Za-z]{1,10})\)/g;
  while ((m = parenLaw.exec(text)) !== null) {
    const candidate = m[1];
    if (KNOWN_LAWS.has(candidate)) {
      laws.add(candidate);
    }
  }

  return [...laws];
}

function isCommonFalsePositive(word: string): boolean {
  const falsePositives = new Set([
    "Abs",
    "Satz",
    "Nr",
    "Buchstabe",
    "Alt",
    "Var",
    "Halbsatz",
    "Art",
    "Teil",
    "Kapitel",
    "Abschnitt",
    "Unterabschnitt",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
    "EU",
    "EUGH",
    "BGH",
    "BVerfG",
    "BFH",
    "BAG",
    "BSG",
    "BVerwG",
    "OLG",
    "LG",
    "AG",
    "SG",
    "VG",
    "FG",
    "ArbG",
    "LSG",
  ]);
  return falsePositives.has(word);
}

/**
 * Extract non-§ references that could be hallucinated.
 * Looks for: EU-Richtlinie, Artikel/Art. X, Richtlinie X/Y/EU
 */
export function extractNonParagraphReferences(text: string): string[] {
  const refs: string[] = [];

  // EU directives
  const euPattern =
    /(?:EU[- ]?Richtlinie|Europ[äa]ische\s+Richtlinie|Richtlinie\s+\d+\/\d+\/EU|Richtlinie)/gi;
  let m: RegExpExecArray | null;
  while ((m = euPattern.exec(text)) !== null) {
    refs.push(m[0]);
  }

  // Article references (Art. X or Artikel X) — only if not "Art." within a § context
  const artPattern = /(?:Art\.|Artikel)\s+(\d+(?:\s*Abs\.\s*\d+)?)\s*([A-Z][A-Za-z]{1,10})?/gi;
  while ((m = artPattern.exec(text)) !== null) {
    // Skip if it's "Art." as abbreviation for "Artikel" in a citation context we already handle
    const full = m[0];
    if (!refs.includes(full)) refs.push(full);
  }

  return [...new Set(refs)];
}

// ─── Hedging & Uncertainty Detection (v2) ─────────────────────────────────

const HEDGING_PATTERNS = [
  /obwohl\s+dieser\s+(?:nicht|kein)/i,
  /obwohl\s+dieser\s+in\s+den\s+bereitgestellten\s+(?:Auszügen|Quellen)\s+nicht/i,
  /nicht\s+vollständig\s+zitiert/i,
  /nicht\s+explizit\s+(?:in|genannt|aufgeführt)/i,
  /nicht\s+direkt\s+(?:in|genannt|aufgeführt)/i,
  /nicht\s+in\s+den\s+(?:Quellen|Auszügen|Rechtsquellen)/i,
  /wird\s+(?:hier|zwar)\s+nicht\s+(?:explizit|direkt)\s+(?:genannt|aufgeführt|zitiert)/i,
  /ist\s+(?:allerdings|zwar)\s+(?:hier|darin)\s+nicht\s+(?:enthalten|genannt)/i,
  /kann\s+(?:hier|darin)\s+nicht\s+(?:nachgelesen|gefunden)\s+werden/i,
  /wird\s+in\s+den\s+Quellen\s+nicht\s+(?:genannt|aufgeführt|zitiert)/i,
];

export function detectHedging(text: string): string[] {
  const found: string[] = [];
  for (const pattern of HEDGING_PATTERNS) {
    const m = text.match(pattern);
    if (m) found.push(m[0]);
  }
  return found;
}

// ── v2: Substantiated uncertainty check ──
// Uncertainty is acceptable when the model provides a specific legal reason
// (e.g. "§ X Abs. 1 und Abs. 2 sind widersprüchlich" or "die Rechtsprechung
// ist zu dieser Frage nicht eindeutig, OGH 5 Ob 123/23 vs. 7 Ob 456/22").
// Vague uncertainty without reasoning ("kann nicht bestimmt werden") is flagged.

const SUBSTANTIATED_PATTERNS = [
  /§\s*\d+\s*(?:Abs\.\s*\d+)?\s*(?:BGB|ABGB|StGB|ZPO|HGB|AO|UWG|StPO)/i,
  /\d+\s*Ob\s*\d+\/\d+/i, // OGH judgment reference
  /\d+\s*Gs\s*\d+\/\d+/i, // OGH GZ
  /BGH\s*,?\s*Urteil\s*vom/i,
  /BVerfG/i,
  /Rechtsprechung\s+ist\s+(?:nicht\s+)?eindeutig/i,
  /strittig\s+(?:in\s+der\s+)?Rechtsprechung/i,
  /umstritten/i,
  /kontrovers/i,
  /differenziert/i,
];

const VAGUE_UNCERTAINTY_PATTERNS = [
  /kann\s+nicht\s+(?:bestimmt|beurteilt|abgeschätzt|mit\s+Sicherheit\s+gesagt)\s+werden/i,
  /lässt\s+sich\s+nicht\s+(?:mit\s+Sicherheit|eindeutig|abschließend)\s+(?:sagen|beurteilen|klären)/i,
  /ist\s+unklar\b/i,
  /kann\s+nicht\s+abschließend\s+(?:beantwortet|geklärt)\s+werden/i,
];

/**
 * v2: Check if hedging phrases are substantiated (have legal reasoning) or vague.
 * Returns { hedging: string[], unsubstantiated: string[] }.
 */
export function detectUncertaintyQuality(text: string): {
  hedging: string[];
  unsubstantiated: string[];
} {
  const hedging = detectHedging(text);
  const unsubstantiated: string[] = [];

  // Check if the text near each hedging phrase has substantiation
  const hasSubstantiation = SUBSTANTIATED_PATTERNS.some((p) => p.test(text));

  // Check for vague uncertainty patterns
  const vagueMatches: string[] = [];
  for (const pattern of VAGUE_UNCERTAINTY_PATTERNS) {
    const m = text.match(pattern);
    if (m) vagueMatches.push(m[0]);
  }

  // If there's hedging but no substantiation anywhere in the text,
  // flag as unsubstantiated uncertainty
  if (hedging.length > 0 && !hasSubstantiation) {
    unsubstantiated.push(...hedging);
  }

  // Vague uncertainty is always flagged (even without hedging)
  if (vagueMatches.length > 0 && !hasSubstantiation) {
    unsubstantiated.push(...vagueMatches);
  }

  return { hedging, unsubstantiated };
}

// ─── Context Citation Extraction ──────────────────────────────────────────

/**
 * Extract all §-citations that appear in the context text.
 * This is the "allowed" list — citations the model may use.
 */
export function extractContextCitations(contextText: string): string[] {
  return extractCitations(contextText);
}

/**
 * Check if a citation from the answer appears in the context.
 * We check the § number and optional Abs./Satz, with or without law abbreviation.
 */
function citationInContext(citation: string, contextText: string): boolean {
  // Parse the citation
  const match = citation.match(
    /§\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(?:Satz\s*(\d+))?\s*([A-Z][A-Za-z]{1,10})?/
  );
  if (!match) return false;

  const [, num, abs, satz, law] = match;

  // ── v2: When Abs/Satz is specified, require precise match ──
  // Previously, "§ 823 Abs. 1" would match context with just "§ 823" via
  // the loose checks. Now, if Abs is specified, we require the Abs to appear
  // in context. This prevents false negatives where the model cites the
  // wrong Absatz of a paragraph that exists in context.

  // Check 1: Exact citation in context (always sufficient)
  if (contextText.includes(citation)) return true;

  // Check 2: If Abs. is specified, require Abs match in context
  if (abs) {
    const withAbs = `§ ${num} Abs. ${abs}`;
    if (contextText.includes(withAbs)) return true;
    const withAbsNoSpace = `§${num} Abs. ${abs}`;
    if (contextText.includes(withAbsNoSpace)) return true;
    // Also check without space after Abs.
    const withAbsNoDotSpace = `§ ${num} Abs.${abs}`;
    if (contextText.includes(withAbsNoDotSpace)) return true;

    // If Satz is also specified, check that too
    if (satz) {
      const withAbsSatz = `§ ${num} Abs. ${abs} Satz ${satz}`;
      if (contextText.includes(withAbsSatz)) return true;
      // When Satz is specified, the (N) format check is not sufficient
      // (it only confirms the Absatz exists, not the specific Satz)
      return false;
    }

    // v2: Also check for (N) format — legal corpus often uses:
    //   "§ 823 BGB\n(1) Wer vorsätzlich..."
    //   instead of "§ 823 Abs. 1 BGB"
    // Look for § <num> followed by (N) within 500 chars (some Absätze are long)
    const paraStart = contextText.indexOf(`§ ${num}`);
    if (paraStart !== -1) {
      const window = contextText.slice(paraStart, paraStart + 500);
      const absInParens = new RegExp(`\\(${abs}\\)`);
      if (absInParens.test(window)) return true;
    }
    // Also check §<num> variant
    const paraStartNoSpace = contextText.indexOf(`§${num}`);
    if (paraStartNoSpace !== -1) {
      const window = contextText.slice(paraStartNoSpace, paraStartNoSpace + 500);
      const absInParens = new RegExp(`\\(${abs}\\)`);
      if (absInParens.test(window)) return true;
    }

    // v2: When Abs is specified, do NOT fall through to loose §-only checks.
    // The citation claims a specific Absatz — if that Absatz isn't in context,
    // the citation is ungrounded even if the § number exists in a different Absatz.
    return false;
  }

  // ── No Abs specified: loose checks are acceptable ──

  // Check 3: "§ <num>" without law abbreviation (common in law text chunks)
  const paraOnly = `§ ${num}`;
  if (contextText.includes(paraOnly)) return true;

  // Check 4: "§<num>" without space (some formatting)
  const paraNoSpace = `§${num}`;
  if (contextText.includes(paraNoSpace)) return true;

  // Check 5: "§§ <num>" (plural form)
  const paraPlural = `§§ ${num}`;
  if (contextText.includes(paraPlural)) return true;

  // Check 6: Number appears in a § context in the text
  const paraRegex = new RegExp(`§§?\\s*${num}\\b`, "i");
  if (paraRegex.test(contextText)) return true;

  return false;
}

// ─── Main Guardrail Check ─────────────────────────────────────────────────

export interface GuardrailInput {
  answer: string;
  context: string;
  topSlugs: string[]; // e.g. ["law/de/bgb", "law/de/zpo"]
}

export function checkCitationGrounding(input: GuardrailInput): GuardrailResult {
  const { answer, context, topSlugs } = input;

  // Extract retrieved law abbreviations from slugs
  const retrievedLaws = topSlugs
    .map((s) =>
      s
        .replace(/^law\/de\//, "")
        .replace(/^law\/at\//, "")
        .replace(/^law\/eu\//, "")
    )
    .filter(Boolean);

  // Extract all citations from answer and context
  const answerCitations = extractCitations(answer);
  const contextCitations = extractContextCitations(context);
  const answerLaws = extractLawAbbreviations(answer);
  const nonParaRefs = extractNonParagraphReferences(answer);
  const { hedging: hedgingPhrases, unsubstantiated: unsubstantiatedPhrases } =
    detectUncertaintyQuality(answer);

  // ── Check 1: Citation Presence ──
  const ungroundedCitations: string[] = [];
  for (const cite of answerCitations) {
    if (!citationInContext(cite, context)) {
      ungroundedCitations.push(cite);
    }
  }

  // ── Check 2: Law Validation ──
  const nonExistentLaws: string[] = [];
  for (const law of answerLaws) {
    if (!KNOWN_LAWS.has(law) && !isCommonFalsePositive(law)) {
      nonExistentLaws.push(law);
    }
  }

  // ── Check 3: Non-§ Reference Grounding ──
  const fabricatedReferences: string[] = [];
  for (const ref of nonParaRefs) {
    // Check if the reference (or its key term) appears in context
    const refLower = ref.toLowerCase();
    const contextLower = context.toLowerCase();

    // For EU-Richtlinie / Richtlinie: check if "Richtlinie" appears in context
    if (/richtlinie/i.test(ref)) {
      if (!/richtlinie/i.test(context)) {
        fabricatedReferences.push(ref);
      }
      continue;
    }

    // For Art./Artikel: check if the article number appears in context
    const artMatch = ref.match(/(?:Art\.|Artikel)\s*(\d+)/i);
    if (artMatch) {
      const artNum = artMatch[1];
      if (!new RegExp(`Art\\.?\\s*${artNum}\\b`, "i").test(context)) {
        // Special case: "Art." might refer to GG articles which use "Art." not "§"
        // Check if the number appears in an article context
        if (!new RegExp(`\\bArtikel\\s*${artNum}\\b`, "i").test(context)) {
          fabricatedReferences.push(ref);
        }
      }
      continue;
    }

    // Fallback: check if the full reference appears in context
    if (!contextLower.includes(refLower)) {
      fabricatedReferences.push(ref);
    }
  }

  // ── Check 4: Hedging & Uncertainty Quality (v2) ──
  // hedgingPhrases and unsubstantiatedPhrases already extracted above.
  // Substantiated uncertainty (with § or judgment reference) is NOT flagged.
  // Only unsubstantiated/vague uncertainty is flagged.

  // ── Check 5: Cross-Law Contamination ──
  const crossLawContamination: string[] = [];
  for (const law of answerLaws) {
    // Skip if law is not a real law (already caught by Check 2)
    if (!KNOWN_LAWS.has(law)) continue;

    // Check if this law appears in retrieved results
    // v2: Use exact case-insensitive match, not substring.
    // Previously "ABGB".includes("BGB") was true → false negative.
    const lawLower = law.toLowerCase();
    const isInRetrieved = retrievedLaws.some((rl) => rl.toLowerCase() === lawLower);

    if (!isInRetrieved) {
      // Special case: GG (Grundgesetz) articles are often cited alongside other laws
      // and GG is a constitutional law that may not need to be in retrieved results
      // for general constitutional references
      if (law === "GG" && answerLaws.length > 1) {
        // GG is often used as background context — only flag if it's the primary citation
        const ggCitations = answerCitations.filter((c) => c.endsWith(" GG"));
        if (ggCitations.length > 0 && !retrievedLaws.some((rl) => rl.toLowerCase() === "gg")) {
          crossLawContamination.push(law);
        }
      } else {
        crossLawContamination.push(law);
      }
    }
  }

  // ── Build flags ──
  const flags: GuardrailFlag[] = [];

  for (const cite of ungroundedCitations) {
    flags.push({
      type: "ungrounded_citation",
      detail: `Citation "${cite}" not found in retrieved context`,
      citation: cite,
      severity: "high" as Severity,
    });
  }

  for (const law of nonExistentLaws) {
    flags.push({
      type: "non_existent_law",
      detail: `Law abbreviation "${law}" is not a known law`,
      citation: law,
      severity: "high" as Severity,
    });
  }

  for (const ref of fabricatedReferences) {
    flags.push({
      type: "fabricated_reference",
      detail: `Reference "${ref}" not found in retrieved context`,
      citation: ref,
      severity: "high" as Severity,
    });
  }

  for (const phrase of hedgingPhrases) {
    flags.push({
      type: "hedging",
      detail: `Model admits ungrounded citation: "${phrase}"`,
      citation: phrase,
      severity: "medium" as Severity,
    });
  }

  for (const phrase of unsubstantiatedPhrases) {
    flags.push({
      type: "unsubstantiated_uncertainty",
      detail: `Vague or unsubstantiated uncertainty: "${phrase}" — provide specific legal reasoning or remove`,
      citation: phrase,
      severity: "medium" as Severity,
    });
  }

  for (const law of crossLawContamination) {
    flags.push({
      type: "cross_law_contamination",
      detail: `Law "${law}" cited but not in retrieved results (${retrievedLaws.join(", ")})`,
      citation: law,
      severity: "medium" as Severity,
    });
  }

  const highSeverityFlags = flags.filter((f) => f.severity === "high");
  const passed = highSeverityFlags.length === 0;

  return {
    passed,
    flags,
    all_citations: answerCitations,
    ungrounded_citations: ungroundedCitations,
    non_existent_laws: nonExistentLaws,
    fabricated_references: fabricatedReferences,
    hedging_phrases: hedgingPhrases,
    cross_law_contamination: crossLawContamination,
    unsubstantiated_uncertainty_phrases: unsubstantiatedPhrases,
    context_citations: contextCitations,
    retrieved_laws: retrievedLaws,
    answer_length: answer.length,
    context_length: context.length,
    check_count: 6,
  };
}

// ─── Regeneration Prompt Builder ──────────────────────────────────────────

/**
 * Build a stricter system prompt for regeneration after guardrail flags.
 * Includes the allowed citations list and explicit prohibitions.
 */
export function buildRegenerationPrompt(
  originalSystemPrompt: string,
  guardrailResult: GuardrailResult,
  context: string
): string {
  const allowedCitations = guardrailResult.context_citations;
  const retrievedLaws = guardrailResult.retrieved_laws;

  const prohibitions: string[] = [];

  if (guardrailResult.ungrounded_citations.length > 0) {
    prohibitions.push(
      `Folgende Zitate wurden in den Rechtsquellen NICHT gefunden und dürfen NICHT verwendet werden: ` +
        `${guardrailResult.ungrounded_citations.join(", ")}`
    );
  }

  if (guardrailResult.non_existent_laws.length > 0) {
    prohibitions.push(
      `Folgende Gesetzesabkürzungen existieren nicht und dürfen NICHT verwendet werden: ` +
        `${guardrailResult.non_existent_laws.join(", ")}`
    );
  }

  if (guardrailResult.fabricated_references.length > 0) {
    prohibitions.push(
      `Folgende Referenzen wurden erfunden und dürfen NICHT verwendet werden: ` +
        `${guardrailResult.fabricated_references.join(", ")}`
    );
  }

  if (guardrailResult.cross_law_contamination.length > 0) {
    prohibitions.push(
      `Folgende Gesetze wurden NICHT in den Suchergebnissen gefunden und dürfen NICHT zitiert werden: ` +
        `${guardrailResult.cross_law_contamination.join(", ")}`
    );
  }

  prohibitions.push(
    `Verwende NUR Paragraphen, die wörtlich in den bereitgestellten Rechtsqueln vorkommen.`
  );
  prohibitions.push(
    `Erlaubte Zitate (nur diese verwenden): ${allowedCitations.length > 0 ? allowedCitations.join(", ") : "die in den Quellen genannten Paragraphen"}`
  );
  prohibitions.push(
    `Erlaubte Gesetze (nur diese verwenden): ${retrievedLaws.map((l) => l.toUpperCase()).join(", ")}`
  );
  prohibitions.push(
    `ERFINDE KEINE EU-Richtlinien, Artikel, Verordnungen oder andere Referenzen, die nicht wörtlich in den Quellen stehen.`
  );
  prohibitions.push(
    `Wenn du eine Information nicht in den Quellen findest, sage explizit: "Diese Information ist in den bereitgestellten Rechtsquellen nicht enthalten."`
  );

  return (
    originalSystemPrompt +
    `\n\n⚠️ STRIKTE ZITIERREGELN (Guardrail aktiviert):\n` +
    prohibitions.map((p) => `• ${p}`).join("\n")
  );
}
