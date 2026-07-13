/**
 * Verification Receipts — core types and pure functions.
 *
 * Work products (Draft, Memo, Fristenreport, Vertragsreview, Redline,
 * Schriftsatz) receive a deterministic, tamper-evident receipt that captures
 * the verification state, checks, models, prompt hashes, source snapshot
 * hashes, timestamps, flags, approvals and an output hash.
 *
 * Policy:
 *   - The receipt is never set by the LLM.
 *   - The verification state is resolved deterministically from checks and flags.
 *   - A content change invalidates the previous receipt or creates a new version.
 *   - UI/API may only display the status, never bypass the policy.
 */

import { createHash, randomUUID } from "crypto";

export type WorkProductType =
  | "draft"
  | "memo"
  | "fristenreport"
  | "vertragsreview"
  | "redline"
  | "schriftsatz";

export type VerificationState =
  | "VERIFIED"
  | "VERIFIED_WITH_WARNINGS"
  | "NEEDS_HUMAN_REVIEW"
  | "BLOCKED"
  | "VERIFIER_ERROR";

export interface ReceiptCheck {
  /** Machine-readable check identifier. */
  name: string;
  /** Human-readable description of what was checked. */
  description: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Severity if the check did not pass. */
  severity: "info" | "warning" | "error" | "critical";
  /** Optional detailed message. */
  message?: string;
}

export interface ReceiptApproval {
  /** User or system identifier that approved the work product. */
  approved_by: string;
  /** ISO timestamp of the approval. */
  approved_at: string;
  /** Role of the approver, e.g. "attorney", "partner". */
  role?: string;
  /** Optional note. */
  note?: string;
}

export interface WorkProductReceipt {
  /** Stable UUID identifying this receipt. */
  receipt_id: string;
  /** Type of work product. */
  product_type: WorkProductType;
  /** Reference to the work product (slug, case id, document id, etc.). */
  product_ref: string;
  /** Monotonic version for this product_ref. */
  version: number;
  /** Previous receipt in the chain, if any. */
  previous_receipt_id?: string;
  /** When this receipt was invalidated by a newer version. */
  invalidated_at?: string;
  /** receipt_id that invalidated this receipt. */
  invalidated_by?: string;

  /** Resolved verification state. */
  state: VerificationState;
  /** Individual checks that fed into the state. */
  checks: ReceiptCheck[];
  /** Policy/guardrail flags (e.g. GUARDRAIL_FLAGGED, CROSS_VERIFY_FLAGGED). */
  flags: string[];
  /** Human or system approvals. */
  approvals: ReceiptApproval[];

  /** Models used to generate the work product. */
  models: string[];
  /** SHA-256 hashes of the prompts that produced the work product. */
  prompt_hashes: string[];
  /** SHA-256 hashes of source snapshots / corpus versions used. */
  source_snapshot_hashes: string[];

  /** SHA-256 hash of the final output content. */
  output_hash: string;
  /** Length of the final output in characters. */
  output_length: number;

  /** ISO timestamp when the receipt was created. */
  created_at: string;
  /** ISO timestamp when the verification finished, if applicable. */
  verified_at?: string;

  /** Tenant / brain id. */
  brain_id: string;
  /** User id that triggered the work product generation. */
  user_id?: string;
  /** Jurisdiction context, e.g. "at", "de", "ch". */
  jurisdiction?: string;
  /** Extensible audit metadata. */
  metadata: Record<string, unknown>;
}

export interface BuildReceiptOptions {
  product_type: WorkProductType;
  product_ref: string;
  previousReceipt?: WorkProductReceipt | null;
  state?: VerificationState;
  checks?: ReceiptCheck[];
  flags?: string[];
  approvals?: ReceiptApproval[];
  models?: string[];
  prompts?: Array<{ system?: string; user: string }>;
  source_snapshot_hashes?: string[];
  output: string | Record<string, unknown> | object;
  brain_id: string;
  user_id?: string;
  jurisdiction?: string;
  metadata?: Record<string, unknown>;
  now?: string;
}

export const ALL_WORK_PRODUCT_TYPES: WorkProductType[] = [
  "draft",
  "memo",
  "fristenreport",
  "vertragsreview",
  "redline",
  "schriftsatz",
];

/**
 * Compute a deterministic SHA-256 hex hash of a string.
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Compute a deterministic SHA-256 hex hash of a work product output.
 * Objects are normalised via JSON.stringify with stable key ordering.
 */
export function computeOutputHash(output: string | Record<string, unknown> | object): string {
  const normalized = typeof output === "string" ? output : stableStringify(output);
  return sha256Hex(normalized);
}

/**
 * Compute a prompt hash from system and user prompt text.
 */
export function computePromptHash(system: string, user: string): string {
  return sha256Hex(system + user);
}

/**
 * Resolve the verification state from checks, flags and an optional risk level.
 *
 * Priority (highest first):
 *   1. Any critical failed check or BLOCKED flag → BLOCKED
 *   2. Any error failed check or NEEDS_HUMAN_REVIEW flag → NEEDS_HUMAN_REVIEW
 *   3. Any warning failed check or warning flag → VERIFIED_WITH_WARNINGS
 *   4. All checks passed → VERIFIED
 *   5. No checks → NEEDS_HUMAN_REVIEW (fail-closed)
 */
export function resolveReceiptState(
  checks: ReceiptCheck[],
  flags: string[] = [],
  riskLevel?: "low" | "medium" | "high" | "critical"
): VerificationState {
  const failed = checks.filter((c) => !c.passed);
  const hasCritical = failed.some((c) => c.severity === "critical");
  const hasError = failed.some((c) => c.severity === "error");
  const hasWarning = failed.some((c) => c.severity === "warning");

  const flagLower = flags.map((f) => f.toLowerCase());
  const isBlocked =
    flagLower.some((f) => f.includes("blocked")) ||
    flagLower.some((f) => f.includes("high_severity")) ||
    riskLevel === "critical" ||
    riskLevel === "high";
  const needsReview =
    flagLower.some((f) => f.includes("needs_human_review")) ||
    flagLower.some((f) => f.includes("human_review")) ||
    flagLower.some((f) => f.includes("flagged"));
  const hasWarnings = flagLower.some((f) => f.includes("warning"));

  if (hasCritical || isBlocked) return "BLOCKED";
  if (hasError || needsReview) return "NEEDS_HUMAN_REVIEW";
  if (hasWarning || hasWarnings) return "VERIFIED_WITH_WARNINGS";
  if (checks.length > 0 && failed.length === 0) return "VERIFIED";
  return "NEEDS_HUMAN_REVIEW";
}

/**
 * Build a deterministic WorkProductReceipt.
 *
 * If a previous receipt is provided and the output hash changed, the previous
 * receipt is logically superseded but NOT mutated here — the caller must mark
 * it invalidated in storage and record the new receipt's `previous_receipt_id`.
 */
export function buildWorkProductReceipt(opts: BuildReceiptOptions): WorkProductReceipt {
  const outputHash = computeOutputHash(opts.output);
  const outputLength =
    typeof opts.output === "string" ? opts.output.length : stableStringify(opts.output).length;

  const promptHashes = (opts.prompts ?? []).map((p) => computePromptHash(p.system ?? "", p.user));

  const checks = opts.checks ?? [];
  const flags = opts.flags ?? [];

  const state = opts.state ?? resolveReceiptState(checks, flags);
  const now = opts.now ?? new Date().toISOString();
  const version = (opts.previousReceipt?.version ?? 0) + 1;

  return {
    receipt_id: randomUUID(),
    product_type: opts.product_type,
    product_ref: opts.product_ref,
    version,
    previous_receipt_id: opts.previousReceipt?.receipt_id,
    state,
    checks,
    flags,
    approvals: opts.approvals ?? [],
    models: opts.models ?? [],
    prompt_hashes: promptHashes,
    source_snapshot_hashes: opts.source_snapshot_hashes ?? [],
    output_hash: outputHash,
    output_length: outputLength,
    created_at: now,
    verified_at: state === "VERIFIED" || state === "VERIFIED_WITH_WARNINGS" ? now : undefined,
    brain_id: opts.brain_id,
    user_id: opts.user_id,
    jurisdiction: opts.jurisdiction,
    metadata: opts.metadata ?? {},
  };
}

/**
 * Check whether a receipt still matches the given content.
 */
export function isReceiptValid(
  receipt: WorkProductReceipt,
  content: string | Record<string, unknown> | object
): boolean {
  return receipt.output_hash === computeOutputHash(content) && !receipt.invalidated_at;
}

/**
 * Mark a receipt as invalidated by a newer receipt. Returns a new object;
 * receipts are immutable.
 */
export function invalidateReceipt(
  receipt: WorkProductReceipt,
  invalidatedByReceiptId: string,
  now?: string
): WorkProductReceipt {
  return {
    ...receipt,
    invalidated_at: now ?? new Date().toISOString(),
    invalidated_by: invalidatedByReceiptId,
  };
}

/**
 * Produce a human-readable summary of the receipt for UI display.
 */
export function receiptStatusSummary(receipt: WorkProductReceipt): {
  state: VerificationState;
  label: string;
  failedChecks: ReceiptCheck[];
  version: number;
  valid: boolean;
} {
  return {
    state: receipt.state,
    label: receipt.state.replace(/_/g, " "),
    failedChecks: receipt.checks.filter((c) => !c.passed),
    version: receipt.version,
    valid: !receipt.invalidated_at,
  };
}

/**
 * Stable JSON.stringify for objects. Sorts keys and handles undefined values.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(value);
}
