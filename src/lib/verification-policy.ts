/**
 * Frontend adapter for the verification policy.
 *
 * Re-exports the core types and functions from the server module
 * and provides a convenience wrapper that logs audit events.
 */

import { logAudit } from "@/lib/audit";
import {
  assertOutputActionAllowed as _assertAllowed,
  VerificationPolicyError,
  buildPolicyOutput,
  isPublishAction,
  isSafeAction,
  validateOverride,
  type OutputAction,
  type PolicyActor,
  type PolicyDecision,
  type PolicyOutput,
  type AttorneyOverride,
} from "../../server/src/core/verification/policy";

export type { OutputAction, PolicyActor, PolicyDecision, PolicyOutput, AttorneyOverride };

export {
  VerificationPolicyError,
  buildPolicyOutput,
  isPublishAction,
  isSafeAction,
  validateOverride,
};

/**
 * Assert that an output action is allowed and log an audit event.
 *
 * On denial: logs `verification.policy_denied` (or `verification.receipt_invalidated`)
 *            and throws VerificationPolicyError.
 * On override: logs `verification.override_granted`.
 * On allow: logs `verification.policy_allowed`.
 *
 * Audit logging is fire-and-forget (non-blocking). The policy check itself
 * is synchronous and throws immediately on denial.
 */
export async function assertOutputActionAllowed(
  output: PolicyOutput,
  action: OutputAction,
  actor: PolicyActor,
  override?: AttorneyOverride
): Promise<PolicyDecision> {
  let decision: PolicyDecision;
  try {
    decision = _assertAllowed(output, action, actor, override);
  } catch (err) {
    if (err instanceof VerificationPolicyError) {
      const auditAction = err.decision.receipt_invalidated
        ? ("verification.receipt_invalidated" as const)
        : ("verification.policy_denied" as const);
      void logAudit(auditAction, "verification_policy", {
        brainId: actor.brain_id,
        userId: actor.user_id,
        userEmail: actor.user_email,
        details: {
          action,
          output_id: output.id,
          state: output.verification_state,
          reason: err.decision.reason,
          title: output.title,
        },
      });
      throw err;
    }
    throw err;
  }

  // Log successful decisions
  if (decision.override) {
    void logAudit("verification.override_granted", "verification_policy", {
      brainId: actor.brain_id,
      userId: actor.user_id,
      userEmail: actor.user_email,
      details: {
        action,
        output_id: output.id,
        state: output.verification_state,
        override_user_id: decision.override.user_id,
        override_reason: decision.override.reason,
        override_timestamp: decision.override.timestamp,
        output_hash: decision.override.output_hash,
        title: output.title,
      },
    });
  } else if (isPublishAction(action)) {
    void logAudit("verification.policy_allowed", "verification_policy", {
      brainId: actor.brain_id,
      userId: actor.user_id,
      userEmail: actor.user_email,
      details: {
        action,
        output_id: output.id,
        state: output.verification_state,
        title: output.title,
      },
    });
  }

  return decision;
}
