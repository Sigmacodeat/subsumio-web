/**
 * Canonical Legal Issue Model — T1.1
 *
 * Type definitions for the canonical legal issue model that replaces
 * free-form agent text with structured, verifiable legal reasoning.
 *
 * Core principle: An agent's free text is NOT canonical truth.
 * Only verified facts with EvidenceSpan references are canonical.
 *
 * Invariants enforced by validator.ts:
 *   I1: satisfied without a verified EvidenceSpan is invalid
 *   I2: unknown/disputed never auto-resolves to a safe result
 *   I3: jurisdiction and as_of_date are mandatory
 *   I4: free agent text is not canonical truth
 *
 * @module server/src/core/legal/issues/types
 */

import type { Jurisdiction } from "../corpus-receipt.ts";

// ── Primitives ────────────────────────────────────────────────────────

/**
 * Assessment status for a single rule element.
 *
 * - `satisfied`: The element is fulfilled, backed by verified evidence.
 *   Invariant I1: MUST have at least one verified EvidenceSpan.
 * - `not_satisfied`: The element is NOT fulfilled, backed by verified evidence.
 *   Invariant I1: MUST have at least one verified EvidenceSpan.
 * - `unknown`: Insufficient information to determine.
 *   Invariant I2: Never auto-resolves to satisfied/not_satisfied.
 * - `disputed`: Facts conflict — different sources support opposite conclusions.
 *   Invariant I2: Never auto-resolves to satisfied/not_satisfied.
 */
export type ElementStatus = "satisfied" | "not_satisfied" | "unknown" | "disputed";

/**
 * Overall status of a legal issue.
 *
 * - `open`: Assessment in progress.
 * - `concluded`: A final conclusion has been reached (IssueConclusion present).
 * - `stale`: The source_snapshot is no longer current (law amended).
 * - `blocked`: Cannot proceed — missing facts or verifier error.
 */
export type IssueStatus = "open" | "concluded" | "stale" | "blocked";

/**
 * Source category for a fact.
 * - `case_file`: Extracted from the case file (uploaded documents).
 * - `statute`: From statutory law (corpus).
 * - `judikatur`: From court decisions.
 * - `agent_inferred`: Inferred by the LLM agent — NOT canonical truth (I4).
 * - `user_provided`: Provided by the human user (attorney).
 */
export type FactSource = "case_file" | "statute" | "judikatur" | "agent_inferred" | "user_provided";

/**
 * Verification state of an evidence span.
 * - `verified`: Content hash matches source snapshot, provenance confirmed.
 * - `unverified`: Not yet checked against source.
 * - `stale`: Source has been amended since this span was created.
 * - `failed`: Content hash mismatch — span does not match any known source.
 */
export type EvidenceVerification = "verified" | "unverified" | "stale" | "failed";

/**
 * Risk level of an issue, for verification routing.
 */
export type IssueRisk = "low" | "medium" | "high";

// ── EvidenceSpan ──────────────────────────────────────────────────────

/**
 * A verifiable span of text from a source document.
 *
 * This is the atomic unit of canonical truth. Every `satisfied` or
 * `not_satisfied` assessment MUST reference at least one verified
 * EvidenceSpan (Invariant I1).
 *
 * Free-form agent text without an EvidenceSpan is NOT canonical.
 */
export interface EvidenceSpan {
  /** Unique ID within the issue (e.g. "ev-001"). */
  id: string;
  /** Slug of the source document (e.g. "law/de/bgb", "case/az-123/urteil"). */
  source_slug: string;
  /** Jurisdiction of the source. */
  jurisdiction: Jurisdiction;
  /** Character offset in the source document (0-based, inclusive). */
  start_offset: number;
  /** Character offset in the source document (exclusive). */
  end_offset: number;
  /** The actual text content of this span. */
  text: string;
  /** SHA-256 hash of the text (64 hex chars) for integrity verification. */
  content_hash: string;
  /** Verification state. Only `verified` spans satisfy Invariant I1. */
  verification: EvidenceVerification;
  /** ISO timestamp when this span was created/extracted. */
  extracted_at: string;
  /** Optional: §-number or paragraph reference within the source. */
  paragraph_ref?: string;
  /** Optional: page number in the source document. */
  page_number?: number;
}

// ── FactReference ─────────────────────────────────────────────────────

/**
 * A reference to a fact, grounded in evidence.
 *
 * Facts are categorized as supporting, opposing, or missing.
 * A fact without evidence spans is an `agent_inferred` claim (I4).
 */
export interface FactReference {
  /** Unique ID within the issue (e.g. "fact-001"). */
  id: string;
  /** Human-readable description of the fact. */
  description: string;
  /** Where this fact comes from. */
  source: FactSource;
  /** Evidence spans that ground this fact. Required for canonical truth. */
  evidence: EvidenceSpan[];
  /** Whether this fact supports or opposes the issue. */
  role: "supporting" | "opposing" | "neutral";
  /** Confidence 0-1. Agent-inferred facts should be ≤ 0.5. */
  confidence: number;
  /** Optional: ISO timestamp when the fact was established (e.g. date of event). */
  established_at?: string;
}

// ── RuleElement ───────────────────────────────────────────────────────

/**
 * A single element of a legal rule's test (Tatbestandsmerkmal).
 *
 * Example: For § 823 Abs. 1 BGB, elements are:
 *   - "Verletzung eines der genannten Rechtsgüter"
 *   - "Handeln einer Person"
 *   - "Kausalität zwischen Handlung und Verletzung"
 *   - "Verschulden (Vorsatz oder Fahrlässigkeit)"
 */
export interface RuleElement {
  /** Unique ID within the rule (e.g. "el-001"). */
  id: string;
  /** The element text (Tatbestandsmerkmal). */
  label: string;
  /** Optional: the §-number or paragraph this element comes from. */
  paragraph_ref?: string;
  /** Whether this element is required for the rule to apply. */
  required: boolean;
}

// ── ElementAssessment ─────────────────────────────────────────────────

/**
 * Assessment of a single rule element against the case facts.
 *
 * Invariant I1: If status is `satisfied` or `not_satisfied`,
 *   `evidence` MUST contain at least one EvidenceSpan with
 *   `verification === "verified"`.
 *
 * Invariant I2: If status is `unknown` or `disputed`,
 *   the issue MUST NOT auto-resolve to `concluded` with a
 *   definitive conclusion.
 */
export interface ElementAssessment {
  /** ID of the RuleElement being assessed. */
  element_id: string;
  /** Assessment status. */
  status: ElementStatus;
  /** Evidence spans supporting this assessment. */
  evidence: EvidenceSpan[];
  /** Human-readable reasoning for this assessment. */
  reasoning: string;
  /** Whether this reasoning was generated by an LLM agent (I4: not canonical). */
  agent_generated: boolean;
  /** Optional: conflicting evidence if status is `disputed`. */
  conflicting_evidence?: EvidenceSpan[];
  /** ISO timestamp of the assessment. */
  assessed_at: string;
}

// ── ApplicableRule ────────────────────────────────────────────────────

/**
 * A legal rule that applies (or potentially applies) to the issue.
 *
 * Contains the statutory basis and the elements that must be assessed.
 */
export interface ApplicableRule {
  /** Unique ID within the issue (e.g. "rule-001"). */
  id: string;
  /** Law abbreviation (e.g. "BGB", "StGB"). */
  law: string;
  /** §-number or full reference (e.g. "823", "823 Abs. 1"). */
  section: string;
  /** Jurisdiction of this rule. */
  jurisdiction: Jurisdiction;
  /** Human-readable description of the rule. */
  description: string;
  /** The elements (Tatbestandsmerkmale) of this rule. */
  required_elements: RuleElement[];
  /** Source slug for the statute text. */
  source_slug: string;
  /** Evidence span for the statute text itself. */
  statute_text: EvidenceSpan;
  /** Optional: leading court decision reference. */
  leading_case?: string;
}

// ── IssueConclusion ───────────────────────────────────────────────────

/**
 * The conclusion of a legal issue.
 *
 * Invariant I2: If any ElementAssessment has status `unknown` or `disputed`,
 *   `is_definitive` MUST be `false`.
 */
export interface IssueConclusion {
  /** Whether the rule applies (yes/no/conditional). */
  outcome: "applies" | "does_not_apply" | "conditional";
  /** Whether this conclusion is definitive (no unknown/disputed elements). */
  is_definitive: boolean;
  /** Human-readable conclusion text. */
  summary: string;
  /** Whether the summary was generated by an LLM agent (I4: not canonical). */
  agent_generated: boolean;
  /** Conditions that must be met for a `conditional` outcome. */
  conditions?: string[];
  /** ISO timestamp of the conclusion. */
  concluded_at: string;
  /** Optional: user ID of the attorney who confirmed the conclusion. */
  confirmed_by?: string;
}

// ── SourceSnapshot ────────────────────────────────────────────────────

/**
 * Reference to the corpus snapshot used for this issue.
 *
 * Invariant I3: jurisdiction and as_of_date are mandatory.
 * This ensures every issue is tied to a specific point-in-time
 * version of the law.
 */
export interface SourceSnapshot {
  /** Jurisdiction of the law applied (I3: mandatory). */
  jurisdiction: Jurisdiction;
  /** ISO date — the "Stichtag" for this analysis (I3: mandatory). */
  as_of_date: string;
  /** Content hashes of all corpus documents used. */
  corpus_hashes: Record<string, string>;
  /** Slugs of all corpus documents referenced. */
  corpus_slugs: string[];
  /** Optional: snapshot store receipt IDs for provenance. */
  receipt_ids?: string[];
}

// ── LegalIssue ────────────────────────────────────────────────────────

/**
 * The canonical legal issue — the top-level aggregate.
 *
 * This is the persistent, verifiable representation of a legal question
 * analyzed against case facts and statutory law.
 *
 * All Pflichtfelder (mandatory fields) are non-optional:
 *   - jurisdiction, as_of_date, source_snapshot
 *   - required_elements, supporting_facts, opposing_facts, missing_facts
 *   - status, assumptions
 */
export interface LegalIssue {
  /** Unique ID (UUID or slug-based). */
  id: string;
  /** Human-readable title of the issue. */
  title: string;
  /** Jurisdiction (I3: mandatory, also in source_snapshot). */
  jurisdiction: Jurisdiction;
  /** Stichtag — the date the analysis is based on (I3: mandatory). */
  as_of_date: string;
  /** Source snapshot at the time of analysis (I3: mandatory). */
  source_snapshot: SourceSnapshot;
  /** The applicable legal rule(s). */
  applicable_rules: ApplicableRule[];
  /** All rule elements from all applicable rules (flattened for quick access). */
  required_elements: RuleElement[];
  /** Assessments for each rule element. */
  element_assessments: ElementAssessment[];
  /** Facts that support the application of the rule. */
  supporting_facts: FactReference[];
  /** Facts that oppose the application of the rule. */
  opposing_facts: FactReference[];
  /** Facts that are missing / unknown. */
  missing_facts: FactReference[];
  /** Assumptions made when facts are missing. */
  assumptions: Assumption[];
  /** Current status of the issue. */
  status: IssueStatus;
  /** Risk level for verification routing. */
  risk: IssueRisk;
  /** The conclusion, if status is `concluded`. */
  conclusion?: IssueConclusion;
  /** ISO timestamp of creation. */
  created_at: string;
  /** ISO timestamp of last update. */
  updated_at: string;
  /** Optional: case file slug this issue belongs to. */
  case_slug?: string;
  /** Optional: brain/tenant ID. */
  brain_id?: string;
  /** Optional: user ID of the attorney who created/owns this issue. */
  owner_id?: string;
  /** Free-text notes from the attorney (NOT canonical, I4). */
  notes?: string;
}

// ── Assumption ────────────────────────────────────────────────────────

/**
 * An assumption made when a fact is missing.
 *
 * Assumptions are explicitly marked as non-canonical (I4).
 * They allow the analysis to proceed but the issue cannot be
 * `concluded` with `is_definitive: true` while assumptions exist.
 */
export interface Assumption {
  /** Unique ID within the issue. */
  id: string;
  /** What is being assumed. */
  description: string;
  /** Which missing fact this assumption covers. */
  covers_fact_id?: string;
  /** Why this assumption is reasonable. */
  justification: string;
  /** Whether this assumption was made by an LLM agent (I4: not canonical). */
  agent_generated: boolean;
  /** ISO timestamp. */
  created_at: string;
}

// ── Validation Error Types ────────────────────────────────────────────

export interface IssueValidationError {
  field: string;
  message: string;
  invariant?: "I1" | "I2" | "I3" | "I4";
}

export interface IssueValidationResult {
  valid: boolean;
  errors: IssueValidationError[];
}

// ── Adapter Types ─────────────────────────────────────────────────────

/**
 * Query options for listing issues from the store.
 */
export interface IssueQuery {
  jurisdiction?: Jurisdiction;
  status?: IssueStatus;
  case_slug?: string;
  brain_id?: string;
  owner_id?: string;
  risk?: IssueRisk;
  limit?: number;
  offset?: number;
}

/**
 * Patch for partial updates to a LegalIssue.
 */
export type LegalIssuePatch = Partial<Pick<LegalIssue,
  | "title"
  | "status"
  | "risk"
  | "conclusion"
  | "notes"
  | "element_assessments"
  | "supporting_facts"
  | "opposing_facts"
  | "missing_facts"
  | "assumptions"
  | "updated_at"
>>;

// ── JSON Schema ───────────────────────────────────────────────────────

/**
 * JSON Schema for LegalIssue serialization.
 * Used for API contracts, storage validation, and interop.
 */
export const LEGAL_ISSUE_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://subsum.io/schemas/legal-issue.json",
  title: "LegalIssue",
  type: "object",
  required: [
    "id", "title", "jurisdiction", "as_of_date", "source_snapshot",
    "applicable_rules", "required_elements", "element_assessments",
    "supporting_facts", "opposing_facts", "missing_facts",
    "assumptions", "status", "risk", "created_at", "updated_at",
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    jurisdiction: { enum: ["DE", "AT", "CH", "EU"] },
    as_of_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    source_snapshot: {
      type: "object",
      required: ["jurisdiction", "as_of_date", "corpus_hashes", "corpus_slugs"],
      properties: {
        jurisdiction: { enum: ["DE", "AT", "CH", "EU"] },
        as_of_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        corpus_hashes: { type: "object", additionalProperties: { type: "string" } },
        corpus_slugs: { type: "array", items: { type: "string" } },
        receipt_ids: { type: "array", items: { type: "string" } },
      },
    },
    applicable_rules: { type: "array", items: { $ref: "#/$defs/ApplicableRule" } },
    required_elements: { type: "array", items: { $ref: "#/$defs/RuleElement" } },
    element_assessments: { type: "array", items: { $ref: "#/$defs/ElementAssessment" } },
    supporting_facts: { type: "array", items: { $ref: "#/$defs/FactReference" } },
    opposing_facts: { type: "array", items: { $ref: "#/$defs/FactReference" } },
    missing_facts: { type: "array", items: { $ref: "#/$defs/FactReference" } },
    assumptions: { type: "array", items: { $ref: "#/$defs/Assumption" } },
    status: { enum: ["open", "concluded", "stale", "blocked"] },
    risk: { enum: ["low", "medium", "high"] },
    conclusion: { $ref: "#/$defs/IssueConclusion" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    case_slug: { type: "string" },
    brain_id: { type: "string" },
    owner_id: { type: "string" },
    notes: { type: "string" },
  },
  $defs: {
    EvidenceSpan: {
      type: "object",
      required: [
        "id", "source_slug", "jurisdiction", "start_offset", "end_offset",
        "text", "content_hash", "verification", "extracted_at",
      ],
      properties: {
        id: { type: "string", minLength: 1 },
        source_slug: { type: "string", minLength: 1 },
        jurisdiction: { enum: ["DE", "AT", "CH", "EU"] },
        start_offset: { type: "integer", minimum: 0 },
        end_offset: { type: "integer", minimum: 0 },
        text: { type: "string" },
        content_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        verification: { enum: ["verified", "unverified", "stale", "failed"] },
        extracted_at: { type: "string", format: "date-time" },
        paragraph_ref: { type: "string" },
        page_number: { type: "integer" },
      },
    },
    FactReference: {
      type: "object",
      required: ["id", "description", "source", "evidence", "role", "confidence"],
      properties: {
        id: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        source: { enum: ["case_file", "statute", "judikatur", "agent_inferred", "user_provided"] },
        evidence: { type: "array", items: { $ref: "#/$defs/EvidenceSpan" } },
        role: { enum: ["supporting", "opposing", "neutral"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        established_at: { type: "string" },
      },
    },
    RuleElement: {
      type: "object",
      required: ["id", "label", "required"],
      properties: {
        id: { type: "string", minLength: 1 },
        label: { type: "string", minLength: 1 },
        paragraph_ref: { type: "string" },
        required: { type: "boolean" },
      },
    },
    ElementAssessment: {
      type: "object",
      required: ["element_id", "status", "evidence", "reasoning", "agent_generated", "assessed_at"],
      properties: {
        element_id: { type: "string", minLength: 1 },
        status: { enum: ["satisfied", "not_satisfied", "unknown", "disputed"] },
        evidence: { type: "array", items: { $ref: "#/$defs/EvidenceSpan" } },
        reasoning: { type: "string" },
        agent_generated: { type: "boolean" },
        conflicting_evidence: { type: "array", items: { $ref: "#/$defs/EvidenceSpan" } },
        assessed_at: { type: "string", format: "date-time" },
      },
    },
    ApplicableRule: {
      type: "object",
      required: [
        "id", "law", "section", "jurisdiction", "description",
        "required_elements", "source_slug", "statute_text",
      ],
      properties: {
        id: { type: "string", minLength: 1 },
        law: { type: "string", minLength: 1 },
        section: { type: "string", minLength: 1 },
        jurisdiction: { enum: ["DE", "AT", "CH", "EU"] },
        description: { type: "string", minLength: 1 },
        required_elements: { type: "array", items: { $ref: "#/$defs/RuleElement" } },
        source_slug: { type: "string", minLength: 1 },
        statute_text: { $ref: "#/$defs/EvidenceSpan" },
        leading_case: { type: "string" },
      },
    },
    IssueConclusion: {
      type: "object",
      required: ["outcome", "is_definitive", "summary", "agent_generated", "concluded_at"],
      properties: {
        outcome: { enum: ["applies", "does_not_apply", "conditional"] },
        is_definitive: { type: "boolean" },
        summary: { type: "string", minLength: 1 },
        agent_generated: { type: "boolean" },
        conditions: { type: "array", items: { type: "string" } },
        concluded_at: { type: "string", format: "date-time" },
        confirmed_by: { type: "string" },
      },
    },
    Assumption: {
      type: "object",
      required: ["id", "description", "justification", "agent_generated", "created_at"],
      properties: {
        id: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        covers_fact_id: { type: "string" },
        justification: { type: "string", minLength: 1 },
        agent_generated: { type: "boolean" },
        created_at: { type: "string", format: "date-time" },
      },
    },
  },
} as const;
