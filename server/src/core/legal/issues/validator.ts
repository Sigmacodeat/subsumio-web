/**
 * Runtime Validator for the Canonical Legal Issue Model — T1.1
 *
 * Enforces all invariants:
 *   I1: satisfied/not_satisfied without verified EvidenceSpan is invalid
 *   I2: unknown/disputed never auto-resolves to a safe result
 *   I3: jurisdiction and as_of_date are mandatory
 *   I4: free agent text is not canonical truth
 *
 * @module server/src/core/legal/issues/validator
 */

import type {
  LegalIssue,
  ElementAssessment,
  EvidenceSpan,
  FactReference,
  IssueConclusion,
  SourceSnapshot,
  ApplicableRule,
  Assumption,
  IssueValidationError,
  IssueValidationResult,
} from "./types.ts";

export type {
  LegalIssue,
  ElementAssessment,
  EvidenceSpan,
  FactReference,
  IssueConclusion,
  Assumption,
} from "./types.ts";

import { computeContentHash, type Jurisdiction } from "../corpus-receipt.ts";

// ── Helpers ───────────────────────────────────────────────────────────

const VALID_JURISDICTIONS: Jurisdiction[] = ["DE", "AT", "CH", "EU"];

function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function isValidISOTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s) && !isNaN(Date.parse(s));
}

function isNonEmpty(s: string | undefined | null): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Check if an EvidenceSpan's content_hash matches its text.
 */
export function verifyEvidenceSpanHash(span: EvidenceSpan): boolean {
  return span.content_hash === computeContentHash(span.text);
}

/**
 * Check if an EvidenceSpan is verified (I1 requirement).
 */
export function isVerifiedEvidence(span: EvidenceSpan): boolean {
  return span.verification === "verified";
}

// ── Sub-Validators ────────────────────────────────────────────────────

function validateEvidenceSpan(span: EvidenceSpan, fieldPrefix: string): IssueValidationError[] {
  const errors: IssueValidationError[] = [];

  if (!isNonEmpty(span.id)) {
    errors.push({ field: `${fieldPrefix}.id`, message: "id must not be empty" });
  }
  if (!isNonEmpty(span.source_slug)) {
    errors.push({ field: `${fieldPrefix}.source_slug`, message: "source_slug must not be empty" });
  }
  if (!VALID_JURISDICTIONS.includes(span.jurisdiction)) {
    errors.push({
      field: `${fieldPrefix}.jurisdiction`,
      message: `jurisdiction must be one of ${VALID_JURISDICTIONS.join(", ")}`,
    });
  }
  if (span.start_offset < 0 || !Number.isInteger(span.start_offset)) {
    errors.push({
      field: `${fieldPrefix}.start_offset`,
      message: "start_offset must be a non-negative integer",
    });
  }
  if (span.end_offset < 0 || !Number.isInteger(span.end_offset)) {
    errors.push({
      field: `${fieldPrefix}.end_offset`,
      message: "end_offset must be a non-negative integer",
    });
  }
  if (span.end_offset <= span.start_offset) {
    errors.push({
      field: `${fieldPrefix}.end_offset`,
      message: "end_offset must be greater than start_offset",
    });
  }
  if (!isNonEmpty(span.text)) {
    errors.push({ field: `${fieldPrefix}.text`, message: "text must not be empty" });
  }
  if (!/^[a-f0-9]{64}$/.test(span.content_hash)) {
    errors.push({
      field: `${fieldPrefix}.content_hash`,
      message: "content_hash must be a 64-char hex SHA-256 hash",
    });
  }
  if (!["verified", "unverified", "stale", "failed"].includes(span.verification)) {
    errors.push({
      field: `${fieldPrefix}.verification`,
      message: "verification must be verified|unverified|stale|failed",
    });
  }
  if (!isValidISOTimestamp(span.extracted_at)) {
    errors.push({
      field: `${fieldPrefix}.extracted_at`,
      message: "extracted_at must be a valid ISO timestamp",
    });
  }

  return errors;
}

function validateFactReference(fact: FactReference, fieldPrefix: string): IssueValidationError[] {
  const errors: IssueValidationError[] = [];

  if (!isNonEmpty(fact.id)) {
    errors.push({ field: `${fieldPrefix}.id`, message: "id must not be empty" });
  }
  if (!isNonEmpty(fact.description)) {
    errors.push({ field: `${fieldPrefix}.description`, message: "description must not be empty" });
  }
  if (
    !["case_file", "statute", "judikatur", "agent_inferred", "user_provided"].includes(fact.source)
  ) {
    errors.push({ field: `${fieldPrefix}.source`, message: "invalid fact source" });
  }
  if (!["supporting", "opposing", "neutral"].includes(fact.role)) {
    errors.push({
      field: `${fieldPrefix}.role`,
      message: "role must be supporting|opposing|neutral",
    });
  }
  if (fact.confidence < 0 || fact.confidence > 1) {
    errors.push({
      field: `${fieldPrefix}.confidence`,
      message: "confidence must be between 0 and 1",
    });
  }

  // I4: agent_inferred facts should have confidence ≤ 0.5
  if (fact.source === "agent_inferred" && fact.confidence > 0.5) {
    errors.push({
      field: `${fieldPrefix}.confidence`,
      message:
        "agent_inferred facts must have confidence ≤ 0.5 (I4: free agent text is not canonical truth)",
      invariant: "I4",
    });
  }

  // Validate evidence spans
  for (let i = 0; i < fact.evidence.length; i++) {
    errors.push(...validateEvidenceSpan(fact.evidence[i]!, `${fieldPrefix}.evidence[${i}]`));
  }

  // I4: agent_inferred facts without evidence are flagged
  if (fact.source === "agent_inferred" && fact.evidence.length === 0) {
    errors.push({
      field: `${fieldPrefix}.evidence`,
      message: "agent_inferred fact has no evidence spans — not canonical truth (I4)",
      invariant: "I4",
    });
  }

  if (fact.established_at && !isValidISODate(fact.established_at)) {
    errors.push({
      field: `${fieldPrefix}.established_at`,
      message: "established_at must be a valid ISO date",
    });
  }

  return errors;
}

function validateElementAssessment(
  assessment: ElementAssessment,
  fieldPrefix: string
): IssueValidationError[] {
  const errors: IssueValidationError[] = [];

  if (!isNonEmpty(assessment.element_id)) {
    errors.push({ field: `${fieldPrefix}.element_id`, message: "element_id must not be empty" });
  }
  if (!["satisfied", "not_satisfied", "unknown", "disputed"].includes(assessment.status)) {
    errors.push({ field: `${fieldPrefix}.status`, message: "invalid status" });
  }
  if (!isNonEmpty(assessment.reasoning)) {
    errors.push({ field: `${fieldPrefix}.reasoning`, message: "reasoning must not be empty" });
  }
  if (!isValidISOTimestamp(assessment.assessed_at)) {
    errors.push({
      field: `${fieldPrefix}.assessed_at`,
      message: "assessed_at must be a valid ISO timestamp",
    });
  }

  // Validate evidence spans
  for (let i = 0; i < assessment.evidence.length; i++) {
    errors.push(...validateEvidenceSpan(assessment.evidence[i]!, `${fieldPrefix}.evidence[${i}]`));
  }
  if (assessment.conflicting_evidence) {
    for (let i = 0; i < assessment.conflicting_evidence.length; i++) {
      errors.push(
        ...validateEvidenceSpan(
          assessment.conflicting_evidence[i]!,
          `${fieldPrefix}.conflicting_evidence[${i}]`
        )
      );
    }
  }

  // I1: satisfied/not_satisfied MUST have at least one verified EvidenceSpan
  if (assessment.status === "satisfied" || assessment.status === "not_satisfied") {
    const hasVerified = assessment.evidence.some(isVerifiedEvidence);
    if (!hasVerified) {
      errors.push({
        field: `${fieldPrefix}.evidence`,
        message: `status "${assessment.status}" requires at least one verified EvidenceSpan (I1)`,
        invariant: "I1",
      });
    }
  }

  return errors;
}

function validateApplicableRule(rule: ApplicableRule, fieldPrefix: string): IssueValidationError[] {
  const errors: IssueValidationError[] = [];

  if (!isNonEmpty(rule.id)) {
    errors.push({ field: `${fieldPrefix}.id`, message: "id must not be empty" });
  }
  if (!isNonEmpty(rule.law)) {
    errors.push({ field: `${fieldPrefix}.law`, message: "law must not be empty" });
  }
  if (!isNonEmpty(rule.section)) {
    errors.push({ field: `${fieldPrefix}.section`, message: "section must not be empty" });
  }
  if (!VALID_JURISDICTIONS.includes(rule.jurisdiction)) {
    errors.push({ field: `${fieldPrefix}.jurisdiction`, message: "invalid jurisdiction" });
  }
  if (!isNonEmpty(rule.description)) {
    errors.push({ field: `${fieldPrefix}.description`, message: "description must not be empty" });
  }
  if (!isNonEmpty(rule.source_slug)) {
    errors.push({ field: `${fieldPrefix}.source_slug`, message: "source_slug must not be empty" });
  }
  if (rule.required_elements.length === 0) {
    errors.push({
      field: `${fieldPrefix}.required_elements`,
      message: "rule must have at least one required element",
    });
  }

  for (let i = 0; i < rule.required_elements.length; i++) {
    const el = rule.required_elements[i]!;
    if (!isNonEmpty(el.id)) {
      errors.push({
        field: `${fieldPrefix}.required_elements[${i}].id`,
        message: "id must not be empty",
      });
    }
    if (!isNonEmpty(el.label)) {
      errors.push({
        field: `${fieldPrefix}.required_elements[${i}].label`,
        message: "label must not be empty",
      });
    }
  }

  errors.push(...validateEvidenceSpan(rule.statute_text, `${fieldPrefix}.statute_text`));

  return errors;
}

function validateSourceSnapshot(
  snapshot: SourceSnapshot,
  fieldPrefix: string
): IssueValidationError[] {
  const errors: IssueValidationError[] = [];

  // I3: jurisdiction is mandatory
  if (!VALID_JURISDICTIONS.includes(snapshot.jurisdiction)) {
    errors.push({
      field: `${fieldPrefix}.jurisdiction`,
      message: "source_snapshot.jurisdiction is mandatory and must be DE|AT|CH|EU (I3)",
      invariant: "I3",
    });
  }

  // I3: as_of_date is mandatory
  if (!isNonEmpty(snapshot.as_of_date) || !isValidISODate(snapshot.as_of_date)) {
    errors.push({
      field: `${fieldPrefix}.as_of_date`,
      message: "source_snapshot.as_of_date is mandatory and must be a valid ISO date (I3)",
      invariant: "I3",
    });
  }

  if (snapshot.corpus_slugs.length === 0) {
    errors.push({
      field: `${fieldPrefix}.corpus_slugs`,
      message: "source_snapshot must reference at least one corpus slug",
    });
  }

  // Check that every corpus_slug has a corresponding hash
  for (const slug of snapshot.corpus_slugs) {
    if (!snapshot.corpus_hashes[slug]) {
      errors.push({
        field: `${fieldPrefix}.corpus_hashes`,
        message: `corpus_hashes missing entry for slug "${slug}"`,
      });
    }
  }

  return errors;
}

function validateAssumption(assumption: Assumption, fieldPrefix: string): IssueValidationError[] {
  const errors: IssueValidationError[] = [];

  if (!isNonEmpty(assumption.id)) {
    errors.push({ field: `${fieldPrefix}.id`, message: "id must not be empty" });
  }
  if (!isNonEmpty(assumption.description)) {
    errors.push({ field: `${fieldPrefix}.description`, message: "description must not be empty" });
  }
  if (!isNonEmpty(assumption.justification)) {
    errors.push({
      field: `${fieldPrefix}.justification`,
      message: "justification must not be empty",
    });
  }
  if (!isValidISOTimestamp(assumption.created_at)) {
    errors.push({
      field: `${fieldPrefix}.created_at`,
      message: "created_at must be a valid ISO timestamp",
    });
  }

  return errors;
}

function validateConclusion(
  conclusion: IssueConclusion,
  fieldPrefix: string
): IssueValidationError[] {
  const errors: IssueValidationError[] = [];

  if (!["applies", "does_not_apply", "conditional"].includes(conclusion.outcome)) {
    errors.push({ field: `${fieldPrefix}.outcome`, message: "invalid outcome" });
  }
  if (!isNonEmpty(conclusion.summary)) {
    errors.push({ field: `${fieldPrefix}.summary`, message: "summary must not be empty" });
  }
  if (!isValidISOTimestamp(conclusion.concluded_at)) {
    errors.push({
      field: `${fieldPrefix}.concluded_at`,
      message: "concluded_at must be a valid ISO timestamp",
    });
  }

  if (
    conclusion.outcome === "conditional" &&
    (!conclusion.conditions || conclusion.conditions.length === 0)
  ) {
    errors.push({
      field: `${fieldPrefix}.conditions`,
      message: "conditional outcome must have at least one condition",
    });
  }

  return errors;
}

// ── Cross-Field Invariant Checks ──────────────────────────────────────

/**
 * Check Invariant I2: unknown/disputed elements must not produce a definitive conclusion.
 */
function checkI2(issue: LegalIssue, errors: IssueValidationError[]): void {
  if (issue.status !== "concluded" || !issue.conclusion) return;

  const hasUncertain = issue.element_assessments.some(
    (a) => a.status === "unknown" || a.status === "disputed"
  );

  if (hasUncertain && issue.conclusion.is_definitive) {
    errors.push({
      field: "conclusion.is_definitive",
      message:
        "conclusion cannot be definitive when element_assessments contain unknown/disputed statuses (I2)",
      invariant: "I2",
    });
  }

  // I2: if assumptions exist, conclusion cannot be definitive
  if (issue.assumptions.length > 0 && issue.conclusion.is_definitive) {
    errors.push({
      field: "conclusion.is_definitive",
      message:
        "conclusion cannot be definitive when assumptions exist (I2: assumptions are not canonical truth)",
      invariant: "I2",
    });
  }
}

/**
 * Check Invariant I4: agent-generated conclusions are not definitive.
 */
function checkI4(issue: LegalIssue, errors: IssueValidationError[]): void {
  if (issue.status !== "concluded" || !issue.conclusion) return;

  if (issue.conclusion.agent_generated && issue.conclusion.is_definitive) {
    errors.push({
      field: "conclusion.is_definitive",
      message:
        "agent-generated conclusion cannot be definitive without human confirmation (I4: free agent text is not canonical truth)",
      invariant: "I4",
    });
  }
}

/**
 * Check that all element_assessments reference valid required_elements.
 */
function checkElementReferences(issue: LegalIssue, errors: IssueValidationError[]): void {
  const elementIds = new Set(issue.required_elements.map((e) => e.id));
  // Also include elements from applicable_rules
  for (const rule of issue.applicable_rules) {
    for (const el of rule.required_elements) {
      elementIds.add(el.id);
    }
  }

  for (let i = 0; i < issue.element_assessments.length; i++) {
    const a = issue.element_assessments[i]!;
    if (!elementIds.has(a.element_id)) {
      errors.push({
        field: `element_assessments[${i}].element_id`,
        message: `element_id "${a.element_id}" does not match any required_element or rule element`,
      });
    }
  }
}

/**
 * Check jurisdiction consistency across the issue.
 */
function checkJurisdictionConsistency(issue: LegalIssue, errors: IssueValidationError[]): void {
  // Issue jurisdiction must match source_snapshot jurisdiction
  if (issue.jurisdiction !== issue.source_snapshot.jurisdiction) {
    errors.push({
      field: "jurisdiction",
      message: `issue.jurisdiction (${issue.jurisdiction}) does not match source_snapshot.jurisdiction (${issue.source_snapshot.jurisdiction})`,
    });
  }

  // All applicable rules must match jurisdiction
  for (let i = 0; i < issue.applicable_rules.length; i++) {
    const rule = issue.applicable_rules[i]!;
    if (rule.jurisdiction !== issue.jurisdiction) {
      errors.push({
        field: `applicable_rules[${i}].jurisdiction`,
        message: `rule jurisdiction (${rule.jurisdiction}) does not match issue jurisdiction (${issue.jurisdiction})`,
      });
    }
  }
}

// ── Main Validator ────────────────────────────────────────────────────

/**
 * Validate a LegalIssue against all invariants.
 *
 * Returns a list of validation errors (empty = valid).
 */
export function validateIssue(issue: LegalIssue): IssueValidationError[] {
  const errors: IssueValidationError[] = [];

  // ── Required top-level fields ──
  if (!isNonEmpty(issue.id)) {
    errors.push({ field: "id", message: "id must not be empty" });
  }
  if (!isNonEmpty(issue.title)) {
    errors.push({ field: "title", message: "title must not be empty" });
  }

  // I3: jurisdiction is mandatory
  if (!VALID_JURISDICTIONS.includes(issue.jurisdiction)) {
    errors.push({
      field: "jurisdiction",
      message: "jurisdiction is mandatory and must be DE|AT|CH|EU (I3)",
      invariant: "I3",
    });
  }

  // I3: as_of_date is mandatory
  if (!isNonEmpty(issue.as_of_date) || !isValidISODate(issue.as_of_date)) {
    errors.push({
      field: "as_of_date",
      message: "as_of_date is mandatory and must be a valid ISO date (I3)",
      invariant: "I3",
    });
  }

  if (!isValidISOTimestamp(issue.created_at)) {
    errors.push({ field: "created_at", message: "created_at must be a valid ISO timestamp" });
  }
  if (!isValidISOTimestamp(issue.updated_at)) {
    errors.push({ field: "updated_at", message: "updated_at must be a valid ISO timestamp" });
  }

  // ── Source snapshot (I3) ──
  errors.push(...validateSourceSnapshot(issue.source_snapshot, "source_snapshot"));

  // ── Applicable rules ──
  for (let i = 0; i < issue.applicable_rules.length; i++) {
    errors.push(...validateApplicableRule(issue.applicable_rules[i]!, `applicable_rules[${i}]`));
  }

  // ── Required elements ──
  if (issue.required_elements.length === 0 && issue.applicable_rules.length === 0) {
    errors.push({
      field: "required_elements",
      message: "issue must have at least one required_element or applicable_rule",
    });
  }

  for (let i = 0; i < issue.required_elements.length; i++) {
    const el = issue.required_elements[i]!;
    if (!isNonEmpty(el.id)) {
      errors.push({ field: `required_elements[${i}].id`, message: "id must not be empty" });
    }
    if (!isNonEmpty(el.label)) {
      errors.push({ field: `required_elements[${i}].label`, message: "label must not be empty" });
    }
  }

  // ── Element assessments ──
  for (let i = 0; i < issue.element_assessments.length; i++) {
    errors.push(
      ...validateElementAssessment(issue.element_assessments[i]!, `element_assessments[${i}]`)
    );
  }

  // ── Facts ──
  for (let i = 0; i < issue.supporting_facts.length; i++) {
    errors.push(...validateFactReference(issue.supporting_facts[i]!, `supporting_facts[${i}]`));
  }
  for (let i = 0; i < issue.opposing_facts.length; i++) {
    errors.push(...validateFactReference(issue.opposing_facts[i]!, `opposing_facts[${i}]`));
  }
  for (let i = 0; i < issue.missing_facts.length; i++) {
    errors.push(...validateFactReference(issue.missing_facts[i]!, `missing_facts[${i}]`));
  }

  // ── Assumptions ──
  for (let i = 0; i < issue.assumptions.length; i++) {
    errors.push(...validateAssumption(issue.assumptions[i]!, `assumptions[${i}]`));
  }

  // ── Conclusion ──
  if (issue.conclusion) {
    errors.push(...validateConclusion(issue.conclusion, "conclusion"));
  }

  // ── Status-conclusion consistency ──
  if (issue.status === "concluded" && !issue.conclusion) {
    errors.push({
      field: "conclusion",
      message: "status is 'concluded' but no conclusion is present",
    });
  }
  if (issue.status !== "concluded" && issue.conclusion) {
    errors.push({
      field: "status",
      message: `status is '${issue.status}' but a conclusion is present — conclusion should only exist when status is 'concluded'`,
    });
  }

  // ── Cross-field invariants ──
  checkI2(issue, errors);
  checkI4(issue, errors);
  checkElementReferences(issue, errors);
  checkJurisdictionConsistency(issue, errors);

  return errors;
}

/**
 * Check if a LegalIssue is valid (no validation errors).
 */
export function isValidIssue(issue: LegalIssue): boolean {
  return validateIssue(issue).length === 0;
}

/**
 * Validate and return a structured result.
 */
export function validateIssueResult(issue: LegalIssue): IssueValidationResult {
  const errors = validateIssue(issue);
  return { valid: errors.length === 0, errors };
}

// ── Adapter: Legacy LegalIssue → Canonical LegalIssue ─────────────────

/**
 * Adapter interface for converting from the legacy `LegalIssue` (from case-analyzer.ts)
 * to the canonical `LegalIssue` (from issues/types.ts).
 *
 * This is an adapter interface — implementations may use LLM, heuristics, or
 * manual mapping. The adapter does NOT create canonical truth; it creates a
 * draft that must be validated and enriched with EvidenceSpans.
 */
export interface IssueAdapter {
  /**
   * Convert a legacy case-analyzer LegalIssue to a canonical LegalIssue draft.
   * The returned draft will have status "open" and unverified evidence.
   */
  adaptLegacy(
    legacy: LegacyLegalIssue,
    opts: { jurisdiction: Jurisdiction; as_of_date: string; case_slug?: string }
  ): LegalIssue;
}

/**
 * Legacy LegalIssue shape from case-analyzer.ts (for adapter interface).
 */
export interface LegacyLegalIssue {
  description: string;
  area: string;
  law?: string;
  sections?: (number | string)[];
  keywords: string[];
  confidence: number;
}

// ── Factory: Create minimal valid issue ───────────────────────────────

/**
 * Create a minimal valid LegalIssue with sensible defaults.
 * Useful for starting a new analysis.
 */
export function createIssueDraft(opts: {
  id: string;
  title: string;
  jurisdiction: Jurisdiction;
  as_of_date: string;
  corpus_slugs: string[];
  corpus_hashes: Record<string, string>;
  case_slug?: string;
  brain_id?: string;
  owner_id?: string;
}): LegalIssue {
  const now = new Date().toISOString();
  return {
    id: opts.id,
    title: opts.title,
    jurisdiction: opts.jurisdiction,
    as_of_date: opts.as_of_date,
    source_snapshot: {
      jurisdiction: opts.jurisdiction,
      as_of_date: opts.as_of_date,
      corpus_hashes: opts.corpus_hashes,
      corpus_slugs: opts.corpus_slugs,
    },
    applicable_rules: [],
    required_elements: [],
    element_assessments: [],
    supporting_facts: [],
    opposing_facts: [],
    missing_facts: [],
    assumptions: [],
    status: "open",
    risk: "medium",
    created_at: now,
    updated_at: now,
    case_slug: opts.case_slug,
    brain_id: opts.brain_id,
    owner_id: opts.owner_id,
  };
}
