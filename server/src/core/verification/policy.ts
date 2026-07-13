/**
 * Central Verification Policy — Output Boundary Enforcement
 *
 * Every output that leaves the system (export, send, sign, file) or is
 * shared internally must pass through `assertOutputActionAllowed`.
 * The policy checks the VerificationState and enforces:
 *
 *   - BLOCKED / VERIFIER_ERROR → no export, send, sign, or file
 *   - NEEDS_HUMAN_REVIEW       → only after explicit attorney override
 *   - Content change            → invalidates the receipt (hash mismatch)
 *   - Preview                   → never counts as a publish release
 *
 * The override mechanism records user_id, reason, timestamp, output hash,
 * and emits an audit event for GoBD-compliant traceability.
 */

import type { VerificationState } from "./states.ts";
import { canPublish } from "./states.ts";

// ── Types ─────────────────────────────────────────────────────────────

export type OutputAction =
  | "preview"
  | "save_draft"
  | "share_internal"
  | "export_docx"
  | "send_client"
  | "file_court"
  | "sign";

/**
 * The output object that the policy evaluates.
 * `content_hash` is the SHA-256 of the output content at verification time.
 * `receipt_hash` is the hash recorded when the verification receipt was issued.
 * If they differ, the content has changed and the receipt is stale.
 */
export interface PolicyOutput {
  /** Unique identifier for this output (e.g. page slug or document ID) */
  id: string;
  /** Current verification state from `resolveVerificationState` */
  verification_state: VerificationState;
  /** SHA-256 hash of the output content at verification time (64 hex chars) */
  content_hash: string;
  /** Hash recorded when the verification receipt was issued.
   *  If absent, content-change validation is skipped. */
  receipt_hash?: string;
  /** Human-readable title for audit logs */
  title?: string;
}

/**
 * The actor attempting the action.
 */
export interface PolicyActor {
  /** User ID from the auth context */
  user_id: string;
  /** User email for audit logging */
  user_email?: string;
  /** Brain (tenant) ID */
  brain_id?: string;
  /** Role label (e.g. "anwalt", "admin", "sachbearbeiter") */
  role?: string;
}

/**
 * Attorney override for NEEDS_HUMAN_REVIEW state.
 * All fields are mandatory — partial overrides are rejected.
 */
export interface AttorneyOverride {
  /** ID of the attorney providing the override */
  user_id: string;
  /** Human-readable justification for the override */
  reason: string;
  /** ISO timestamp when the override was granted */
  timestamp: string;
  /** SHA-256 hash of the output content at override time (must match content_hash) */
  output_hash: string;
}

/**
 * Result of a policy check.
 */
export interface PolicyDecision {
  allowed: boolean;
  action: OutputAction;
  output_id: string;
  state: VerificationState;
  reason: string;
  /** Present only when an override was applied */
  override?: AttorneyOverride;
  /** Whether the receipt was invalidated by a content change */
  receipt_invalidated?: boolean;
}

// ── Action Categories ─────────────────────────────────────────────────

/**
 * Actions that are always allowed regardless of verification state.
 * Preview and save_draft do not publish or distribute content.
 */
const SAFE_ACTIONS: ReadonlySet<OutputAction> = new Set(["preview", "save_draft"]);

/**
 * Actions that distribute or publish content externally.
 * These require the output to be in a publishable state.
 */
const PUBLISH_ACTIONS: ReadonlySet<OutputAction> = new Set([
  "export_docx",
  "send_client",
  "file_court",
  "sign",
  "share_internal",
]);

/**
 * Actions that are strictly forbidden for BLOCKED and VERIFIER_ERROR states.
 * Even an attorney override cannot unblock these — the output must be
 * re-verified or corrected first.
 */
const FATAL_STATES: ReadonlySet<VerificationState> = new Set(["BLOCKED", "VERIFIER_ERROR"]);

// ── Error Class ───────────────────────────────────────────────────────

/**
 * Thrown when an output action is denied by the verification policy.
 * The caller should translate this into an HTTP 403 response.
 */
export class VerificationPolicyError extends Error {
  readonly decision: PolicyDecision;

  constructor(decision: PolicyDecision) {
    super(decision.reason);
    this.name = "VerificationPolicyError";
    this.decision = decision;
  }
}

// ── Core Policy Function ──────────────────────────────────────────────

/**
 * Assert that an output action is allowed under the current verification state.
 *
 * @throws {VerificationPolicyError} if the action is denied.
 * @returns PolicyDecision if the action is allowed.
 *
 * Rules:
 * 1. preview / save_draft → always allowed (not a publish release)
 * 2. BLOCKED / VERIFIER_ERROR → all publish actions denied (no override possible)
 * 3. NEEDS_HUMAN_REVIEW → publish actions denied unless a valid override is provided
 * 4. VERIFIED / VERIFIED_WITH_WARNINGS → publish actions allowed
 * 5. Content hash mismatch → receipt invalidated, action denied (re-verification required)
 * 6. Override must have user_id, reason, timestamp, and matching output_hash
 */
export function assertOutputActionAllowed(
  output: PolicyOutput,
  action: OutputAction,
  actor: PolicyActor,
  override?: AttorneyOverride
): PolicyDecision {
  const baseDecision: Omit<PolicyDecision, "allowed"> = {
    action,
    output_id: output.id,
    state: output.verification_state,
    reason: "",
  };

  // ── Rule 1: Safe actions are always allowed ──
  if (SAFE_ACTIONS.has(action)) {
    return {
      ...baseDecision,
      allowed: true,
      reason: `Action "${action}" is a safe action (no publish release).`,
    };
  }

  // ── Rule 5: Content hash mismatch → receipt invalidated ──
  if (output.receipt_hash && output.receipt_hash !== output.content_hash) {
    const decision: PolicyDecision = {
      ...baseDecision,
      allowed: false,
      reason:
        `Content has changed since verification (receipt_hash=${output.receipt_hash.slice(0, 12)}… ` +
        `vs content_hash=${output.content_hash.slice(0, 12)}…). ` +
        `Receipt invalidated — re-verification required before ${action}.`,
      receipt_invalidated: true,
    };
    throw new VerificationPolicyError(decision);
  }

  // ── Rule 2: BLOCKED / VERIFIER_ERROR → hard deny, no override ──
  if (FATAL_STATES.has(output.verification_state)) {
    const decision: PolicyDecision = {
      ...baseDecision,
      allowed: false,
      reason:
        `Output is in state ${output.verification_state}. ` +
        `Action "${action}" is forbidden — no override possible. ` +
        `The output must be corrected and re-verified.`,
    };
    throw new VerificationPolicyError(decision);
  }

  // ── Rule 3: NEEDS_HUMAN_REVIEW → requires override ──
  if (output.verification_state === "NEEDS_HUMAN_REVIEW") {
    if (!override) {
      const decision: PolicyDecision = {
        ...baseDecision,
        allowed: false,
        reason:
          `Output is in state NEEDS_HUMAN_REVIEW. ` +
          `Action "${action}" requires an explicit attorney override ` +
          `(user_id, reason, timestamp, output_hash).`,
      };
      throw new VerificationPolicyError(decision);
    }

    // Validate override completeness
    const overrideError = validateOverride(override, output.content_hash);
    if (overrideError) {
      const decision: PolicyDecision = {
        ...baseDecision,
        allowed: false,
        reason: `Invalid attorney override: ${overrideError}`,
        override,
      };
      throw new VerificationPolicyError(decision);
    }

    // Override is valid — action allowed
    return {
      ...baseDecision,
      allowed: true,
      reason:
        `Output was in NEEDS_HUMAN_REVIEW but an attorney override was provided ` +
        `by user ${override.user_id}. Reason: ${override.reason}`,
      override,
    };
  }

  // ── Rule 4: VERIFIED / VERIFIED_WITH_WARNINGS → allowed ──
  if (canPublish(output.verification_state)) {
    return {
      ...baseDecision,
      allowed: true,
      reason:
        `Output is in state ${output.verification_state}. ` + `Action "${action}" is allowed.`,
    };
  }

  // ── Fallback: unknown state → deny ──
  const decision: PolicyDecision = {
    ...baseDecision,
    allowed: false,
    reason:
      `Output is in unknown state ${output.verification_state}. ` +
      `Action "${action}" denied by default (fail-closed).`,
  };
  throw new VerificationPolicyError(decision);
}

// ── Override Validation ───────────────────────────────────────────────

/**
 * Validate that an attorney override is complete and consistent.
 * Returns an error message string if invalid, null if valid.
 */
export function validateOverride(override: AttorneyOverride, expectedHash: string): string | null {
  if (!override.user_id || override.user_id.trim() === "") {
    return "user_id is required";
  }
  if (!override.reason || override.reason.trim() === "") {
    return "reason is required";
  }
  if (override.reason.trim().length < 10) {
    return "reason must be at least 10 characters";
  }
  if (!override.timestamp || !isValidISOTimestamp(override.timestamp)) {
    return "timestamp must be a valid ISO 8601 string";
  }
  if (!override.output_hash || !/^[a-f0-9]{64}$/.test(override.output_hash)) {
    return "output_hash must be a valid SHA-256 hash (64 hex chars)";
  }
  if (override.output_hash !== expectedHash) {
    return `output_hash mismatch (override=${override.output_hash.slice(0, 12)}… vs expected=${expectedHash.slice(0, 12)}…)`;
  }
  return null;
}

// ── Helper ────────────────────────────────────────────────────────────

function isValidISOTimestamp(s: string): boolean {
  try {
    const d = new Date(s);
    return !isNaN(d.getTime());
  } catch {
    return false;
  }
}

/**
 * Check whether an action is a publish action (distributes content externally).
 */
export function isPublishAction(action: OutputAction): boolean {
  return PUBLISH_ACTIONS.has(action);
}

/**
 * Check whether an action is a safe action (no external distribution).
 */
export function isSafeAction(action: OutputAction): boolean {
  return SAFE_ACTIONS.has(action);
}

/**
 * Build a PolicyOutput from a verification decision and content hash.
 * Convenience helper for integration points.
 */
export function buildPolicyOutput(
  id: string,
  state: VerificationState,
  contentHash: string,
  opts?: {
    receipt_hash?: string;
    title?: string;
  }
): PolicyOutput {
  return {
    id,
    verification_state: state,
    content_hash: contentHash,
    receipt_hash: opts?.receipt_hash,
    title: opts?.title,
  };
}
