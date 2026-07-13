/**
 * Corpus Receipt — Provenance Schema for Legal Source Documents
 *
 * Every law corpus file (BGB, ABGB, StGB, etc.) gets a CorpusReceipt that
 * records where it came from, when it was fetched, what version it is,
 * and its content hash. This enables:
 *   1. Reproducibility: know exactly which version of a law was used
 *   2. Staleness detection: compare current vs. stored hash
 *   3. Source provenance: trace back to official URL
 *   4. Amendment tracking: detect when laws change
 *
 * Used by snapshot-store.ts for persistent storage.
 */

import { createHash } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────

export type Jurisdiction = "DE" | "AT" | "CH" | "EU";

export type LicenseStatus = "public" | "licensed" | "pending";

export interface CorpusReceipt {
  /** Unique slug identifying this corpus file, e.g. "law/de/bgb" */
  slug: string;
  /** Jurisdiction: DE, AT, CH, EU */
  jurisdiction: Jurisdiction;
  /** Statute abbreviation, e.g. "BGB", "ABGB", "StGB" */
  statute_code: string;
  /** ISO date when this version became legally effective (if known) */
  valid_from: string;
  /** ISO date when this version was superseded (null = currently valid) */
  valid_to: string | null;
  /** ISO timestamp when the content was fetched from source */
  fetched_at: string;
  /** Official source URL (RIS, gesetze-im-internet.de, fedlex, EUR-Lex) */
  source_url: string;
  /** SHA-256 hash of the full text content (64 chars hex) */
  content_hash: string;
  /** Version of the parser/ingestor used to process the raw content */
  parser_version: string;
  /** License status of the source */
  license_status: LicenseStatus;
  /** Number of amendments detected since previous snapshot (0 = first import) */
  amendment_count: number;
  /** Optional: official announcement date (Bekanntmachung) */
  announcement_date?: string;
  /** Optional: official gazette reference (e.g. "BGBl. I S. 123") */
  gazette_reference?: string;
  /** Optional: language of the text (default "de") */
  language?: string;
  /** Optional: number of paragraphs in the text */
  paragraph_count?: number;
}

// ── Validation ────────────────────────────────────────────────────────

export interface ReceiptValidationError {
  field: string;
  message: string;
}

/**
 * Validate a CorpusReceipt for completeness and correctness.
 * Returns an array of validation errors (empty = valid).
 */
export function validateReceipt(receipt: CorpusReceipt): ReceiptValidationError[] {
  const errors: ReceiptValidationError[] = [];

  if (!receipt.slug || receipt.slug.trim() === "") {
    errors.push({ field: "slug", message: "slug must not be empty" });
  }

  if (!receipt.jurisdiction || !["DE", "AT", "CH", "EU"].includes(receipt.jurisdiction)) {
    errors.push({ field: "jurisdiction", message: "jurisdiction must be DE, AT, CH, or EU" });
  }

  if (!receipt.statute_code || receipt.statute_code.trim() === "") {
    errors.push({ field: "statute_code", message: "statute_code must not be empty" });
  }

  if (!receipt.valid_from || !isValidISODate(receipt.valid_from)) {
    errors.push({ field: "valid_from", message: "valid_from must be a valid ISO date" });
  }

  if (receipt.valid_to !== null && !isValidISODate(receipt.valid_to)) {
    errors.push({ field: "valid_to", message: "valid_to must be null or a valid ISO date" });
  }

  if (!receipt.fetched_at || !isValidISOTimestamp(receipt.fetched_at)) {
    errors.push({ field: "fetched_at", message: "fetched_at must be a valid ISO timestamp" });
  }

  // v2: source_url must NOT be empty (Phase 0C requirement)
  if (!receipt.source_url || receipt.source_url.trim() === "") {
    errors.push({
      field: "source_url",
      message: "source_url must not be empty — every corpus document must have provenance",
    });
  }

  if (!receipt.content_hash || !/^[a-f0-9]{64}$/.test(receipt.content_hash)) {
    errors.push({
      field: "content_hash",
      message: "content_hash must be a 64-char hex SHA-256 hash",
    });
  }

  if (!receipt.parser_version || receipt.parser_version.trim() === "") {
    errors.push({ field: "parser_version", message: "parser_version must not be empty" });
  }

  if (
    !receipt.license_status ||
    !["public", "licensed", "pending"].includes(receipt.license_status)
  ) {
    errors.push({
      field: "license_status",
      message: "license_status must be public, licensed, or pending",
    });
  }

  if (receipt.amendment_count < 0 || !Number.isInteger(receipt.amendment_count)) {
    errors.push({
      field: "amendment_count",
      message: "amendment_count must be a non-negative integer",
    });
  }

  // valid_to must be after valid_from if set
  if (receipt.valid_to !== null && receipt.valid_to < receipt.valid_from) {
    errors.push({ field: "valid_to", message: "valid_to must be after valid_from" });
  }

  return errors;
}

/**
 * Check if a receipt is valid (no validation errors).
 */
export function isValidReceipt(receipt: CorpusReceipt): boolean {
  return validateReceipt(receipt).length === 0;
}

// ── Hashing ───────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of text content (full 64 chars hex).
 * Note: statute-freshness.ts uses 16-char truncation for per-§ hashes,
 * but receipts use the full 64-char hash for integrity verification.
 */
export function computeContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Create a new CorpusReceipt from raw data.
 * Computes the content hash and fills in defaults.
 */
export function createReceipt(opts: {
  slug: string;
  jurisdiction: Jurisdiction;
  statute_code: string;
  text: string;
  source_url: string;
  parser_version: string;
  valid_from?: string;
  fetched_at?: string;
  license_status?: LicenseStatus;
  amendment_count?: number;
  announcement_date?: string;
  gazette_reference?: string;
  language?: string;
  paragraph_count?: number;
}): CorpusReceipt {
  const now = new Date().toISOString();
  const content_hash = computeContentHash(opts.text);

  return {
    slug: opts.slug,
    jurisdiction: opts.jurisdiction,
    statute_code: opts.statute_code,
    valid_from: opts.valid_from ?? now.slice(0, 10),
    valid_to: null,
    fetched_at: opts.fetched_at ?? now,
    source_url: opts.source_url,
    content_hash,
    parser_version: opts.parser_version,
    license_status: opts.license_status ?? "public",
    amendment_count: opts.amendment_count ?? 0,
    announcement_date: opts.announcement_date,
    gazette_reference: opts.gazette_reference,
    language: opts.language ?? "de",
    paragraph_count: opts.paragraph_count,
  };
}

// ── Comparison ────────────────────────────────────────────────────────

/**
 * Check if a receipt's content hash matches the given text.
 */
export function receiptMatchesContent(receipt: CorpusReceipt, text: string): boolean {
  return receipt.content_hash === computeContentHash(text);
}

/**
 * Check if a receipt is currently valid (valid_to is null or in the future).
 */
export function isCurrentlyValid(receipt: CorpusReceipt, asOfDate?: string): boolean {
  const date = asOfDate ?? new Date().toISOString().slice(0, 10);
  if (receipt.valid_to === null) return true;
  return receipt.valid_to >= date;
}

// ── Source URL Patterns ───────────────────────────────────────────────

/**
 * Known official source URL patterns per jurisdiction.
 * Used to validate that source_url points to an official source.
 */
export const OFFICIAL_SOURCE_PATTERNS: Record<Jurisdiction, RegExp[]> = {
  DE: [
    /^https?:\/\/(?:www\.)?gesetze-im-internet\.de\//i,
    /^https?:\/\/(?:www\.)?buzer\.de\//i,
    /^https?:\/\/(?:www\.)?dejure\.org\//i,
    /^https?:\/\/(?:www\.)?bmi\.bund\.de\//i,
  ],
  AT: [
    /^https?:\/\/(?:www\.)?ris\.bka\.gv\.at\//i,
    /^https?:\/\/(?:www\.)?data\.ris\.bka\.gv\.at\//i,
    /^https?:\/\/(?:www\.)?bka\.gv\.at\//i,
    /^https?:\/\/(?:www\.)?rdb\.at\//i,
  ],
  CH: [/^https?:\/\/(?:www\.)?fedlex\.data\.admin\.ch\//i, /^https?:\/\/(?:www\.)?admin\.ch\//i],
  EU: [/^https?:\/\/(?:www\.)?eur-lex\.europa\.eu\//i, /^https?:\/\/(?:www\.)?eur-lex\.eu\//i],
};

/**
 * Check if a source URL matches known official patterns for the jurisdiction.
 */
export function isOfficialSource(url: string, jurisdiction: Jurisdiction): boolean {
  const patterns = OFFICIAL_SOURCE_PATTERNS[jurisdiction];
  if (!patterns) return false;
  return patterns.some((p) => p.test(url));
}

// ── Helpers ───────────────────────────────────────────────────────────

function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function isValidISOTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s) && !isNaN(Date.parse(s));
}

// ── Serialization ─────────────────────────────────────────────────────

/**
 * Serialize a receipt to a compact JSON string for storage.
 */
export function serializeReceipt(receipt: CorpusReceipt): string {
  return JSON.stringify(receipt);
}

/**
 * Deserialize a receipt from JSON string.
 * Returns null if parsing fails or the result is invalid.
 */
export function deserializeReceipt(json: string): CorpusReceipt | null {
  try {
    const parsed = JSON.parse(json) as CorpusReceipt;
    if (!isValidReceipt(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
