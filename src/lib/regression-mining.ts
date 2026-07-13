/**
 * EPIC 9 — T9.2 Regression Mining
 * ================================
 *
 * Confirmed production errors (from T9.1 Feedback-Triage) are converted
 * into anonymized developer fixtures for regression testing.
 *
 * Key principles:
 *   - NO client data in public or cross-tenant training sets
 *   - All PII is stripped or replaced with synthetic placeholders
 *   - Fixtures are compatible with existing eval harness formats
 *   - Each fixture links back to the source triage entry for auditability
 *
 * Fixture format: JSONL compatible with lab-dach and eval-harness patterns.
 */

import type { TriageEntry, ErrorClass, RootCause } from "@/lib/feedback-triage";

// ── Types ─────────────────────────────────────────────────────────────

/**
 * An anonymized regression fixture derived from a confirmed production error.
 */
export interface RegressionFixture {
  /** Unique fixture ID */
  id: string;
  /** Source triage entry ID (for auditability) */
  source_triage_id: string;
  /** Anonymized query (PII stripped) */
  query: string;
  /** Anonymized incorrect answer (what the system produced) */
  incorrect_answer: string;
  /** Correct answer (from jurist's correction) */
  correct_answer: string;
  /** Error class from triage */
  error_class: ErrorClass;
  /** Root cause from triage */
  root_cause: RootCause;
  /** Jurisdiction */
  jurisdiction: "DE" | "AT" | "CH";
  /** Expected behavior: what the system should do */
  expected_behavior: string;
  /** Automated check type that should catch this */
  check_type:
    | "citation_grounded"
    | "law_valid"
    | "jurisdiction_correct"
    | "frist_correct"
    | "language"
    | "semantic_match";
  /** Keywords that must appear in a correct answer */
  expected_keywords: string[];
  /** Keywords that must NOT appear (hallucination markers) */
  forbidden_keywords: string[];
  /** Severity from triage */
  severity: "low" | "medium" | "high" | "critical";
  /** When the fixture was created */
  created_at: string;
  /** Anonymization metadata */
  anonymization: AnonymizationMetadata;
}

export interface AnonymizationMetadata {
  /** Number of PII entities removed */
  pii_entities_removed: number;
  /** Types of PII removed */
  pii_types: string[];
  /** Whether client names were replaced */
  client_names_replaced: boolean;
  /** Whether case-specific details were generalized */
  case_details_generalized: boolean;
  /** Hash of original content for audit (not the content itself) */
  original_content_hash: string;
}

export interface RegressionMiningStats {
  total_fixtures: number;
  by_error_class: Record<string, number>;
  by_root_cause: Record<string, number>;
  by_jurisdiction: Record<string, number>;
  by_severity: Record<string, number>;
  by_check_type: Record<string, number>;
  total_pii_removed: number;
  avg_pii_per_fixture: number;
}

// ── PII Detection & Anonymization ─────────────────────────────────────

/** PII patterns to detect and replace */
const PII_PATTERNS: Array<{
  type: string;
  regex: RegExp;
  replacement: string;
}> = [
  // Email addresses
  { type: "email", regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: "[EMAIL]" },
  // IBAN (must be before phone to prevent partial matching)
  { type: "iban", regex: /\b[A-Z]{2}\d{2}\s?(?:\d{4}\s?){4,7}\d{1,4}\b/g, replacement: "[IBAN]" },
  // Phone numbers (DE/AT/CH formats) — must start with + or 0 followed by digits
  { type: "phone", regex: /(?:\+49|\+43|\+41|0[1-9])[\d\s\/\-()]{5,18}/g, replacement: "[PHONE]" },
  // German tax IDs
  { type: "tax_id", regex: /\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/g, replacement: "[TAX_ID]" },
  // Dates (DD.MM.YYYY) — generalized to [DATE]
  { type: "date", regex: /\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, replacement: "[DATE]" },
  // Street addresses (German format) — handles "Müllerstraße 45" and "Berliner Straße 45"
  {
    type: "address",
    regex:
      /\b[A-ZÄÖÜ][a-zäöüß]+(?:straße|weg|gasse|platz|allee|Straße|Weg|Gasse|Platz|Allee)?\s+(?:[A-ZÄÖÜ][a-zäöüß]+(?:straße|weg|gasse|platz|allee|Straße|Weg|Gasse|Platz|Allee)\s+)?\d+[a-z]?/g,
    replacement: "[ADDRESS]",
  },
  // Postal codes (5-digit German, 4-digit AT/CH)
  { type: "postal_code", regex: /\b\d{4,5}\b/g, replacement: "[PLZ]" },
  // Person names (Herr/Frau + Capitalized name)
  {
    type: "person_name",
    regex: /\b(?:Herr|Frau|Dr\.|Prof\.)\s+[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?/g,
    replacement: "[PERSON]",
  },
  // Company names (GmbH, AG, KG, OHG, UG)
  {
    type: "company",
    regex:
      /\b[A-ZÄÖÜ][\wäöüß&.-]+(?:\s+[A-ZÄÖÜ][\wäöüß&.-]+)*\s+(?:GmbH|AG|KG|OHG|UG|GbR|e\.V\.)\b/g,
    replacement: "[COMPANY]",
  },
  // Case file numbers (Az: ... / Geschäftszahl: ...)
  {
    type: "case_number",
    regex: /(?:Az\.?:|Geschäftsnummer:|Geschäftszahl:|GZ:)\s*[\w\d\/\.\-()]+/gi,
    replacement: "[CASE_NUMBER]",
  },
  // Amounts with currency (€ doesn't have word boundary, use lookahead or end)
  {
    type: "amount",
    regex: /\b\d{1,3}(?:\.\d{3})*(?:,\d+)?\s?(?:€|EUR|CHF|Euro)(?=\s|$|[,.;!?])/g,
    replacement: "[AMOUNT]",
  },
];

/**
 * Anonymize text by replacing PII with placeholders.
 * Returns the anonymized text and metadata about what was removed.
 */
export function anonymizeText(text: string): {
  anonymized: string;
  metadata: AnonymizationMetadata;
} {
  let anonymized = text;
  const piiTypes = new Set<string>();
  let piiCount = 0;

  for (const pattern of PII_PATTERNS) {
    const matches = anonymized.match(pattern.regex);
    if (matches) {
      piiCount += matches.length;
      piiTypes.add(pattern.type);
      anonymized = anonymized.replace(pattern.regex, pattern.replacement);
    }
  }

  // Generalize case-specific details: replace specific legal case references
  const caseRefPattern = /(?:Urteil|Beschluss|Bescheid|Klage|Schiedsspruch)\s+(?:vom\s+)?\[DATE\]/g;
  if (caseRefPattern.test(anonymized)) {
    anonymized = anonymized.replace(caseRefPattern, "[CASE_REFERENCE]");
    piiTypes.add("case_reference");
  }

  const contentHash = hashContent(text);

  return {
    anonymized,
    metadata: {
      pii_entities_removed: piiCount,
      pii_types: [...piiTypes],
      client_names_replaced: piiTypes.has("company") || piiTypes.has("person_name"),
      case_details_generalized: piiTypes.has("case_number") || piiTypes.has("case_reference"),
      original_content_hash: contentHash,
    },
  };
}

/**
 * Simple SHA-256-like hash for audit purposes.
 * Uses a deterministic hash function (not crypto-secure, but sufficient for audit trail).
 */
function hashContent(text: string): string {
  let hash = 0;
  const str = text.slice(0, 1000); // Limit to first 1000 chars for performance
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit int
  }
  return `hash-${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

// ── Fixture Generation ────────────────────────────────────────────────

let fixtureIdCounter = 0;

function generateFixtureId(): string {
  fixtureIdCounter++;
  return `reg-${Date.now()}-${fixtureIdCounter.toString().padStart(4, "0")}`;
}

/**
 * Determine the automated check type based on error class.
 */
function inferCheckType(errorClass: ErrorClass): RegressionFixture["check_type"] {
  switch (errorClass) {
    case "citation_error":
      return "citation_grounded";
    case "frist_error":
      return "frist_correct";
    case "model_hallucination":
      return "semantic_match";
    case "retrieval_miss":
      return "semantic_match";
    case "corpus_gap":
      return "semantic_match";
    case "prompt_error":
      return "semantic_match";
    case "ui_confusion":
      return "semantic_match";
    default:
      return "semantic_match";
  }
}

/**
 * Extract expected keywords from the correction text.
 * Filters for legal terms, paragraph references, and domain-specific vocabulary.
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];

  // §-references
  const paraMatches = text.match(/§\s*\d+[a-z]?(?:\s*(?:Abs\.|Absatz)\s*\d+)?/g);
  if (paraMatches) keywords.push(...paraMatches);

  // Art.-references (Swiss law)
  const artMatches = text.match(/Art\.?\s*\d+[a-z]?/g);
  if (artMatches) keywords.push(...artMatches);

  // Law abbreviations
  const lawMatches = text.match(
    /\b(?:BGB|ABGB|StGB|ZPO|StPO|HGB|AO|OR|ZGB|AHG|UGB|UWG|DSG|B-VG|EMRK|UrhG|PatG|MarkenG)\b/g
  );
  if (lawMatches) keywords.push(...lawMatches);

  // Legal terms (German)
  const legalTerms = [
    "Verjährung",
    "Schadensersatz",
    "Gewährleistung",
    "Kündigung",
    "Berufung",
    "Revision",
    "Beschwerde",
    "Klage",
    "Beklagter",
    "Kläger",
    "Frist",
    "Notfrist",
    "Vorfrist",
    "Zustellung",
    "Mangel",
    "Rücktritt",
    "Schmerzensgeld",
    "Unterhalt",
    "Erbrecht",
    "Testamentsvollstrecker",
    "Treuhand",
    "Sicherung",
    "Grundschuld",
    "Hypothek",
  ];
  for (const term of legalTerms) {
    if (text.includes(term)) {
      keywords.push(term);
    }
  }

  return [...new Set(keywords)];
}

/**
 * Extract forbidden keywords from the incorrect answer.
 * These are terms that indicate the error (e.g., wrong law references).
 */
function extractForbiddenKeywords(incorrectAnswer: string, correctAnswer: string): string[] {
  const forbidden: string[] = [];

  // Law references in incorrect answer that don't appear in correct answer
  const incorrectLaws: string[] =
    incorrectAnswer.match(/\b(?:BGB|ABGB|StGB|ZPO|StPO|HGB|AO|OR|ZGB|AHG|UGB|UWG|DSG)\b/g) ?? [];
  const correctLaws: string[] =
    correctAnswer.match(/\b(?:BGB|ABGB|StGB|ZPO|StPO|HGB|AO|OR|ZGB|AHG|UGB|UWG|DSG)\b/g) ?? [];

  for (const law of incorrectLaws) {
    if (!correctLaws.includes(law)) {
      forbidden.push(law);
    }
  }

  // §-references in incorrect answer that don't appear in correct answer
  const incorrectParas: string[] = incorrectAnswer.match(/§\s*\d+[a-z]?/g) ?? [];
  const correctParas: string[] = correctAnswer.match(/§\s*\d+[a-z]?/g) ?? [];

  for (const para of incorrectParas) {
    if (!correctParas.includes(para)) {
      forbidden.push(para);
    }
  }

  return [...new Set(forbidden)];
}

/**
 * Generate a regression fixture from a confirmed triage entry.
 * The fixture is fully anonymized — no client data leaks.
 */
export function mineFixtureFromTriage(entry: TriageEntry): RegressionFixture {
  if (entry.triage_state !== "confirmed") {
    throw new Error(`Cannot mine fixture from non-confirmed entry (state: ${entry.triage_state})`);
  }
  if (!entry.correction) {
    throw new Error("Confirmed entry has no correction — cannot mine fixture");
  }
  if (!entry.error_class || !entry.root_cause || !entry.severity) {
    throw new Error("Confirmed entry missing error_class, root_cause, or severity");
  }

  const queryAnon = anonymizeText(entry.query);
  const answerAnon = anonymizeText(entry.answer_excerpt);
  const correctionAnon = anonymizeText(entry.correction);

  const expectedKeywords = extractKeywords(correctionAnon.anonymized);
  const forbiddenKeywords = extractForbiddenKeywords(
    answerAnon.anonymized,
    correctionAnon.anonymized
  );

  const jurisdiction = entry.jurisdiction ?? "DE";

  const expectedBehavior = buildExpectedBehavior(
    entry.error_class,
    entry.root_cause,
    correctionAnon.anonymized
  );

  const fixture: RegressionFixture = {
    id: generateFixtureId(),
    source_triage_id: entry.id,
    query: queryAnon.anonymized,
    incorrect_answer: answerAnon.anonymized,
    correct_answer: correctionAnon.anonymized,
    error_class: entry.error_class,
    root_cause: entry.root_cause,
    jurisdiction,
    expected_behavior: expectedBehavior,
    check_type: inferCheckType(entry.error_class),
    expected_keywords: expectedKeywords,
    forbidden_keywords: forbiddenKeywords,
    severity: entry.severity,
    created_at: new Date().toISOString(),
    anonymization: {
      pii_entities_removed:
        queryAnon.metadata.pii_entities_removed +
        answerAnon.metadata.pii_entities_removed +
        correctionAnon.metadata.pii_entities_removed,
      pii_types: [
        ...new Set([
          ...queryAnon.metadata.pii_types,
          ...answerAnon.metadata.pii_types,
          ...correctionAnon.metadata.pii_types,
        ]),
      ],
      client_names_replaced:
        queryAnon.metadata.client_names_replaced ||
        answerAnon.metadata.client_names_replaced ||
        correctionAnon.metadata.client_names_replaced,
      case_details_generalized:
        queryAnon.metadata.case_details_generalized ||
        answerAnon.metadata.case_details_generalized ||
        correctionAnon.metadata.case_details_generalized,
      original_content_hash: hashContent(entry.query + entry.answer_excerpt + entry.correction),
    },
  };

  return fixture;
}

function buildExpectedBehavior(
  errorClass: ErrorClass,
  rootCause: RootCause,
  correction: string
): string {
  const classDescriptions: Record<ErrorClass, string> = {
    prompt_error: "The system should produce a correct answer given a well-structured prompt",
    retrieval_miss: "The system should retrieve the correct legal sources for this query",
    corpus_gap: "The corpus should contain the necessary legal sources for this query",
    ui_confusion: "The UI should clearly present the information without ambiguity",
    model_hallucination: "The model should not fabricate legal citations or statutes",
    frist_error: "The frist-engine should calculate the correct deadline",
    citation_error: "All citations should be grounded in retrieved source text",
    other: "The system should produce the correct answer",
  };

  const base = classDescriptions[errorClass];
  const correctionSnippet = correction.slice(0, 200);
  return `${base}. Expected correction: ${correctionSnippet}...`;
}

// ── Batch Mining ──────────────────────────────────────────────────────

/**
 * Mine multiple fixtures from confirmed triage entries.
 * Only processes confirmed, unmined entries.
 */
export function mineFixturesFromTriage(entries: TriageEntry[]): {
  fixtures: RegressionFixture[];
  mined_count: number;
  skipped_count: number;
  errors: Array<{ triage_id: string; error: string }>;
} {
  const fixtures: RegressionFixture[] = [];
  const errors: Array<{ triage_id: string; error: string }> = [];
  let skipped = 0;

  for (const entry of entries) {
    if (entry.triage_state !== "confirmed") {
      skipped++;
      continue;
    }
    if (entry.mined_to_fixture) {
      skipped++;
      continue;
    }
    try {
      const fixture = mineFixtureFromTriage(entry);
      fixtures.push(fixture);
    } catch (err) {
      errors.push({
        triage_id: entry.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    fixtures,
    mined_count: fixtures.length,
    skipped_count: skipped,
    errors,
  };
}

// ── Export ────────────────────────────────────────────────────────────

/**
 * Export fixtures as JSONL string (for file export or API response).
 */
export function exportFixturesAsJSONL(fixtures: RegressionFixture[]): string {
  return fixtures.map((f) => JSON.stringify(f)).join("\n");
}

/**
 * Export fixtures as eval-harness compatible format.
 * Maps to the structure used by lab-dach and eval-harness-reuse.
 */
export function exportFixturesForEvalHarness(fixtures: RegressionFixture[]): Array<{
  id: string;
  query: string;
  expected_keywords: string[];
  forbidden_keywords: string[];
  check_type: string;
  jurisdiction: string;
  metadata: Record<string, unknown>;
}> {
  return fixtures.map((f) => ({
    id: f.id,
    query: f.query,
    expected_keywords: f.expected_keywords,
    forbidden_keywords: f.forbidden_keywords,
    check_type: f.check_type,
    jurisdiction: f.jurisdiction,
    metadata: {
      source_triage_id: f.source_triage_id,
      error_class: f.error_class,
      root_cause: f.root_cause,
      severity: f.severity,
      incorrect_answer: f.incorrect_answer,
      correct_answer: f.correct_answer,
      expected_behavior: f.expected_behavior,
    },
  }));
}

// ── Privacy Guard ─────────────────────────────────────────────────────

/**
 * Verify that a fixture does not contain any PII.
 * Returns a list of violations (empty = clean).
 */
export function verifyNoPII(fixture: RegressionFixture): string[] {
  const violations: string[] = [];
  const allText = `${fixture.query} ${fixture.incorrect_answer} ${fixture.correct_answer}`;

  for (const pattern of PII_PATTERNS) {
    // Skip postal_code check for [PLZ] placeholders themselves
    const textToCheck = allText.replace(/\[PLZ\]/g, "");
    if (pattern.regex.test(textToCheck)) {
      // Reset lastIndex for global regex
      pattern.regex.lastIndex = 0;
      violations.push(`PII found: ${pattern.type}`);
    }
  }

  // Check for common German names that might not be caught by patterns
  const namePattern =
    /\b(?:Müller|Schmidt|Schneider|Fischer|Weber|Meyer|Wagner|Becker|Hoffmann|Schäfer|Kowalski|Huber|Gruber|Steiner|Bauer|Wagner|Pichler|Reiter)\b/g;
  if (namePattern.test(allText)) {
    violations.push("PII found: surname");
  }

  return violations;
}

/**
 * Batch privacy check: verify all fixtures are PII-free.
 */
export function verifyBatchNoPII(fixtures: RegressionFixture[]): {
  clean: boolean;
  violations: Array<{ fixture_id: string; issues: string[] }>;
} {
  const violations: Array<{ fixture_id: string; issues: string[] }> = [];

  for (const fixture of fixtures) {
    const issues = verifyNoPII(fixture);
    if (issues.length > 0) {
      violations.push({ fixture_id: fixture.id, issues });
    }
  }

  return {
    clean: violations.length === 0,
    violations,
  };
}

// ── Stats ─────────────────────────────────────────────────────────────

export function computeMiningStats(fixtures: RegressionFixture[]): RegressionMiningStats {
  const byErrorClass: Record<string, number> = {};
  const byRootCause: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byCheckType: Record<string, number> = {};
  let totalPII = 0;

  for (const f of fixtures) {
    byErrorClass[f.error_class] = (byErrorClass[f.error_class] ?? 0) + 1;
    byRootCause[f.root_cause] = (byRootCause[f.root_cause] ?? 0) + 1;
    byJurisdiction[f.jurisdiction] = (byJurisdiction[f.jurisdiction] ?? 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCheckType[f.check_type] = (byCheckType[f.check_type] ?? 0) + 1;
    totalPII += f.anonymization.pii_entities_removed;
  }

  return {
    total_fixtures: fixtures.length,
    by_error_class: byErrorClass,
    by_root_cause: byRootCause,
    by_jurisdiction: byJurisdiction,
    by_severity: bySeverity,
    by_check_type: byCheckType,
    total_pii_removed: totalPII,
    avg_pii_per_fixture: fixtures.length > 0 ? totalPII / fixtures.length : 0,
  };
}

// ── Reset (for testing) ───────────────────────────────────────────────

export function _resetRegressionStore(): void {
  fixtureIdCounter = 0;
}
