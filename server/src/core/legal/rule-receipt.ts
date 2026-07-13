/**
 * Legal Rule Receipt — Provenance Schema for Hardcoded Legal Rules
 *
 * Every hardcoded legal rule (deadline, fee table, statute of limitations,
 * concept mapping, threshold) must have a LegalRuleReceipt that records:
 *   - Where the rule comes from (official source URL)
 *   - When it became legally effective (valid_from)
 *   - When it was superseded (valid_to, null = currently valid)
 *   - Who reviewed it (reviewer_id)
 *   - Content hash of the source text at time of review
 *
 * This extends the CorpusReceipt pattern from corpus-receipt.ts but is
 * designed for individual legal rules rather than whole statute files.
 */

import { createHash } from "node:crypto";
import {
  type Jurisdiction,
  isOfficialSource,
  OFFICIAL_SOURCE_PATTERNS,
} from "./corpus-receipt.ts";

// ── Types ─────────────────────────────────────────────────────────────

export type LegalRuleType =
  | "deadline"
  | "cost"
  | "statute_of_limitations"
  | "concept_mapping"
  | "threshold"
  | "holiday";

export interface RulePayload {
  /** For deadline rules: duration in days/months/years */
  days?: number;
  months?: number;
  years?: number;
  /** For cost rules: fee table steps */
  stufen?: Array<{ bis: number; gebuehr?: number; schritt?: number; je?: number }>;
  /** For cost rules: factors */
  faktoren?: Record<string, number>;
  /** For cost rules: flat fees */
  pauschalen?: Record<string, number>;
  /** For cost rules: tax rate */
  mwst?: number;
  /** For concept mappings: §-numbers */
  sections?: number[];
  /** For threshold rules: threshold value */
  value?: number;
  /** For holiday rules: holiday names */
  holidays?: string[];
}

export interface TransitionalCondition {
  /** Description of the transitional rule */
  description: string;
  /** Condition expression (human-readable) */
  condition: string;
  /** Source citation for the transitional rule */
  source: string;
}

export interface RuleException {
  /** Description of the exception */
  description: string;
  /** Condition under which the exception applies */
  condition: string;
  /** Source citation for the exception */
  source: string;
}

export interface LegalRuleReceipt {
  /** Unique key identifying this rule, e.g. "zpo-berufung-de" */
  rule_key: string;
  /** Rule category */
  rule_type: LegalRuleType;
  /** Human-readable label */
  label: string;
  /** Statutory citation, e.g. "§ 517 ZPO" or "Art. 127 OR" */
  law_citation: string;
  /** Jurisdiction: DE, AT, CH, EU */
  jurisdiction: Jurisdiction;
  /** Rule-specific payload (duration, fee table, §-numbers, etc.) */
  payload: RulePayload;
  /** ISO date when this rule became legally effective */
  valid_from: string;
  /** ISO date when this rule was superseded (null = currently valid) */
  valid_to: string | null;
  /** Official source URL (gesetze-im-internet.de, RIS, fedlex, EUR-Lex) */
  source_url: string;
  /** SHA-256 hash of the source text at time of review (64 chars hex) */
  source_hash: string;
  /** ID of the legal expert who reviewed this rule */
  reviewer_id: string;
  /** ISO timestamp of review */
  reviewed_at: string;
  /** Optional: transitional law conditions */
  transitional_conditions?: TransitionalCondition[];
  /** Optional: explicit exceptions */
  exceptions?: RuleException[];
  /** Optional: gazette reference (e.g. "BGBl. I S. 123") */
  gazette_reference?: string;
}

// ── Validation ────────────────────────────────────────────────────────

export interface RuleReceiptValidationError {
  rule_key: string;
  field: string;
  message: string;
}

/**
 * Validate a LegalRuleReceipt for completeness and correctness.
 * Returns an array of validation errors (empty = valid).
 */
export function validateRuleReceipt(
  receipt: LegalRuleReceipt
): RuleReceiptValidationError[] {
  const errors: RuleReceiptValidationError[] = [];
  const { rule_key: key } = receipt;

  if (!receipt.rule_key || receipt.rule_key.trim() === "") {
    errors.push({ rule_key: key, field: "rule_key", message: "rule_key must not be empty" });
  }

  if (!receipt.rule_type || !isValidRuleType(receipt.rule_type)) {
    errors.push({
      rule_key: key,
      field: "rule_type",
      message: `rule_type must be one of: deadline, cost, statute_of_limitations, concept_mapping, threshold, holiday`,
    });
  }

  if (!receipt.label || receipt.label.trim() === "") {
    errors.push({ rule_key: key, field: "label", message: "label must not be empty" });
  }

  if (!receipt.law_citation || receipt.law_citation.trim() === "") {
    errors.push({
      rule_key: key,
      field: "law_citation",
      message: "law_citation must not be empty — every rule must cite its statutory basis",
    });
  }

  if (!receipt.jurisdiction || !["DE", "AT", "CH", "EU"].includes(receipt.jurisdiction)) {
    errors.push({
      rule_key: key,
      field: "jurisdiction",
      message: "jurisdiction must be DE, AT, CH, or EU",
    });
  }

  if (!receipt.valid_from || !isValidISODate(receipt.valid_from)) {
    errors.push({
      rule_key: key,
      field: "valid_from",
      message: "valid_from must be a valid ISO date (YYYY-MM-DD)",
    });
  }

  if (receipt.valid_to !== null && !isValidISODate(receipt.valid_to)) {
    errors.push({
      rule_key: key,
      field: "valid_to",
      message: "valid_to must be null or a valid ISO date",
    });
  }

  if (receipt.valid_to !== null && receipt.valid_to < receipt.valid_from) {
    errors.push({ rule_key: key, field: "valid_to", message: "valid_to must be after valid_from" });
  }

  if (!receipt.source_url || receipt.source_url.trim() === "") {
    errors.push({
      rule_key: key,
      field: "source_url",
      message: "source_url must not be empty — every rule must have provenance",
    });
  } else if (!isOfficialSource(receipt.source_url, receipt.jurisdiction)) {
    errors.push({
      rule_key: key,
      field: "source_url",
      message: `source_url must be an official source for jurisdiction ${receipt.jurisdiction} (matched against ${OFFICIAL_SOURCE_PATTERNS[receipt.jurisdiction]?.length ?? 0} patterns)`,
    });
  }

  if (!receipt.source_hash || !/^[a-f0-9]{64}$/.test(receipt.source_hash)) {
    errors.push({
      rule_key: key,
      field: "source_hash",
      message: "source_hash must be a 64-char hex SHA-256 hash",
    });
  }

  if (!receipt.reviewer_id || receipt.reviewer_id.trim() === "") {
    errors.push({
      rule_key: key,
      field: "reviewer_id",
      message: "reviewer_id must not be empty — every rule must be reviewed by a named expert",
    });
  }

  if (!receipt.reviewed_at || !isValidISOTimestamp(receipt.reviewed_at)) {
    errors.push({
      rule_key: key,
      field: "reviewed_at",
      message: "reviewed_at must be a valid ISO timestamp",
    });
  }

  return errors;
}

/**
 * Check if a rule receipt is valid (no validation errors).
 */
export function isValidRuleReceipt(receipt: LegalRuleReceipt): boolean {
  return validateRuleReceipt(receipt).length === 0;
}

// ── Hashing ───────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of source text (full 64 chars hex).
 */
export function computeRuleHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Create a new LegalRuleReceipt from raw data.
 * Computes the source hash and fills in defaults.
 */
export function createRuleReceipt(opts: {
  rule_key: string;
  rule_type: LegalRuleType;
  label: string;
  law_citation: string;
  jurisdiction: Jurisdiction;
  payload: RulePayload;
  source_url: string;
  source_text: string;
  reviewer_id: string;
  valid_from: string;
  valid_to?: string | null;
  reviewed_at?: string;
  transitional_conditions?: TransitionalCondition[];
  exceptions?: RuleException[];
  gazette_reference?: string;
}): LegalRuleReceipt {
  return {
    rule_key: opts.rule_key,
    rule_type: opts.rule_type,
    label: opts.label,
    law_citation: opts.law_citation,
    jurisdiction: opts.jurisdiction,
    payload: opts.payload,
    valid_from: opts.valid_from,
    valid_to: opts.valid_to ?? null,
    source_url: opts.source_url,
    source_hash: computeRuleHash(opts.source_text),
    reviewer_id: opts.reviewer_id,
    reviewed_at: opts.reviewed_at ?? new Date().toISOString(),
    transitional_conditions: opts.transitional_conditions,
    exceptions: opts.exceptions,
    gazette_reference: opts.gazette_reference,
  };
}

// ── Registry ──────────────────────────────────────────────────────────

/**
 * The global registry of all legal rule receipts.
 * This is populated at module load time and used by CI tests to verify
 * that every hardcoded rule has a receipt.
 */
const ruleReceiptRegistry = new Map<string, LegalRuleReceipt>();

/**
 * Register a rule receipt in the global registry.
 */
export function registerRuleReceipt(receipt: LegalRuleReceipt): void {
  const errors = validateRuleReceipt(receipt);
  if (errors.length > 0) {
    const msgs = errors.map((e) => `  - ${e.field}: ${e.message}`).join("\n");
    throw new Error(
      `Cannot register invalid rule receipt "${receipt.rule_key}":\n${msgs}`
    );
  }
  if (ruleReceiptRegistry.has(receipt.rule_key)) {
    throw new Error(`Duplicate rule_key "${receipt.rule_key}" in registry`);
  }
  ruleReceiptRegistry.set(receipt.rule_key, receipt);
}

/**
 * Get a rule receipt by key.
 */
export function getRuleReceipt(rule_key: string): LegalRuleReceipt | undefined {
  return ruleReceiptRegistry.get(rule_key);
}

/**
 * Get all registered rule receipts.
 */
export function getAllRuleReceipts(): LegalRuleReceipt[] {
  return Array.from(ruleReceiptRegistry.values());
}

/**
 * Check if a rule key has a registered receipt.
 */
export function hasRuleReceipt(rule_key: string): boolean {
  return ruleReceiptRegistry.has(rule_key);
}

/**
 * Get all rule keys that are registered.
 */
export function getRegisteredRuleKeys(): Set<string> {
  return new Set(ruleReceiptRegistry.keys());
}

/**
 * Clear the registry (for testing).
 */
export function clearRuleReceiptRegistry(): void {
  ruleReceiptRegistry.clear();
}

// ── Helpers ───────────────────────────────────────────────────────────

function isValidRuleType(t: string): boolean {
  return [
    "deadline",
    "cost",
    "statute_of_limitations",
    "concept_mapping",
    "threshold",
    "holiday",
  ].includes(t);
}

function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function isValidISOTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s) && !isNaN(Date.parse(s));
}
