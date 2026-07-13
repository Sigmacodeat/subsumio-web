/**
 * EPIC 8 — T8.4 Queue Reliability: Mandatory Validator Enforcement
 *
 * T8.4 requirement: "Mandatory checks must not run as optional child jobs."
 *
 * When a job is marked as `mandatory: true`, the queue enforces:
 *   1. The parent's `on_child_fail` policy MUST be "fail_parent" —
 *      "ignore" and "continue" are rejected at submission time.
 *   2. If a mandatory child fails, the parent is automatically failed
 *      regardless of the on_child_fail policy.
 *   3. Mandatory children cannot be cancelled independently — they must
 *      run to completion (success or failure).
 *
 * This module provides the validation logic that MinionQueue.add()
 * calls before inserting a job.
 */

import type { ChildFailPolicy } from "./types.ts";

export interface MandatoryValidationOpts {
  mandatory: boolean;
  on_child_fail?: ChildFailPolicy;
  parent_job_id?: number;
}

export interface MandatoryValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that a mandatory job's submission complies with the
 * "mandatory checks must not run as optional child jobs" rule.
 */
export function validateMandatorySubmission(
  opts: MandatoryValidationOpts
): MandatoryValidationResult {
  if (!opts.mandatory) {
    return { valid: true };
  }

  // Mandatory jobs must have a parent (they are children by definition)
  if (!opts.parent_job_id) {
    return {
      valid: false,
      error:
        "Mandatory jobs must have a parent_job_id. A mandatory check without a parent is meaningless — it cannot fail the parent it's supposed to protect.",
    };
  }

  // Mandatory jobs must use "fail_parent" on_child_fail policy
  // "ignore" and "continue" would allow the parent to proceed even if the
  // mandatory check fails — defeating the purpose.
  if (opts.on_child_fail && opts.on_child_fail !== "fail_parent") {
    return {
      valid: false,
      error:
        `Mandatory jobs must use on_child_fail: "fail_parent" (got "${opts.on_child_fail}"). ` +
        `A mandatory check with "${opts.on_child_fail}" would allow the parent to proceed ` +
        `even if the mandatory check fails — defeating the purpose of a mandatory check.`,
    };
  }

  return { valid: true };
}

/**
 * Determine whether a parent should be failed when a child completes.
 *
 * If the child was mandatory and failed/timed out, the parent MUST fail
 * regardless of the on_child_fail policy.
 */
export function shouldFailParentForChild(
  childWasMandatory: boolean,
  childOutcome: "completed" | "failed" | "dead" | "cancelled" | "timeout",
  onChildFail: ChildFailPolicy
): { shouldFail: boolean; reason: string } {
  if (childOutcome === "completed") {
    return { shouldFail: false, reason: "child completed successfully" };
  }

  // Mandatory child failure → always fail parent
  if (childWasMandatory) {
    return {
      shouldFail: true,
      reason: `Mandatory child ${childOutcome} — parent must fail regardless of on_child_fail policy`,
    };
  }

  // Non-mandatory: respect on_child_fail policy
  switch (onChildFail) {
    case "fail_parent":
      return { shouldFail: true, reason: `on_child_fail=fail_parent and child ${childOutcome}` };
    case "remove_dep":
      return { shouldFail: false, reason: "on_child_fail=remove_dep — parent continues" };
    case "ignore":
      return { shouldFail: false, reason: "on_child_fail=ignore — parent continues" };
    case "continue":
      return { shouldFail: false, reason: "on_child_fail=continue — parent continues" };
  }
}

/**
 * Check if a job can be cancelled.
 * Mandatory jobs cannot be cancelled independently — they must run to
 * completion. Only the parent's cancellation can cascade to mandatory children.
 */
export function canCancelMandatoryJob(
  isMandatory: boolean,
  hasParentCancelling: boolean
): { canCancel: boolean; reason?: string } {
  if (isMandatory && !hasParentCancelling) {
    return {
      canCancel: false,
      reason:
        "Mandatory jobs cannot be cancelled independently. They must run to completion. Cancel the parent job to cascade-cancel mandatory children.",
    };
  }
  return { canCancel: true };
}
