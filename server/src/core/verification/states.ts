/**
 * Risk-based Verification States
 *
 * Replaces the fail-open pattern ("proceeding with best effort") with
 * explicit states that callers must check before publishing output.
 *
 * Core principle: A verifier error is NEVER VERIFIED.
 * High-severity flags on high-risk outputs are BLOCKED.
 */

import type { GuardrailResult, GuardrailFlag } from "../citation-guardrail.ts";
import type { CrossVerifyResult, CrossVerifyFlag } from "../think/cross-verify.ts";

export type VerificationState =
  | "VERIFIED"
  | "VERIFIED_WITH_WARNINGS"
  | "NEEDS_HUMAN_REVIEW"
  | "BLOCKED"
  | "VERIFIER_ERROR";

export type OutputRiskLevel = "low" | "medium" | "high";

export interface VerificationContext {
  /** Risk level of the output being verified */
  risk_level: OutputRiskLevel;
  /** Whether the citation guardrail (Tier 0) ran */
  guardrail_ran: boolean;
  /** Whether cross-verify (Tier 1) ran */
  cross_verify_ran: boolean;
  /** Whether the cross-verify result indicates a technical failure */
  cross_verify_error?: boolean;
  /** Jurisdiction of the case (for conflict detection) */
  jurisdiction?: string;
}

export interface VerificationDecision {
  state: VerificationState;
  reason: string;
  blocking_flags: Array<{
    source: "guardrail" | "cross_verify";
    type: string;
    severity: string;
    detail: string;
    citation?: string;
  }>;
  requires_human_review: boolean;
  publish_allowed: boolean;
}

/**
 * Determine the verification state from guardrail and cross-verify results.
 *
 * Rules:
 * 1. Verifier error (technical failure) → VERIFIER_ERROR (never VERIFIED)
 * 2. High-risk output requires BOTH guardrail and cross-verify to run.
 *    If either is missing → NEEDS_HUMAN_REVIEW, not publishable.
 * 3. High-severity guardrail/cross-verify flag + high/medium risk → BLOCKED
 * 4. High-severity flag on low-risk output → NEEDS_HUMAN_REVIEW
 * 5. Medium/low flags → VERIFIED_WITH_WARNINGS
 * 6. No flags → VERIFIED
 *
 * publish_allowed is always derived from the final state and cannot be
 * overridden by the caller.
 */
export function resolveVerificationState(
  guardrail: GuardrailResult | null,
  crossVerify: CrossVerifyResult | null,
  ctx: VerificationContext
): VerificationDecision {
  const blockingFlags: VerificationDecision["blocking_flags"] = [];

  // ── Rule 1: Verifier error → VERIFIER_ERROR (never VERIFIED) ──
  // Check both explicit context flag and the result's own verifier_error field.
  // Also treat inconsistent "ran but result is null" as a verifier failure.
  if (
    ctx.cross_verify_error ||
    crossVerify?.verifier_error ||
    (ctx.guardrail_ran && guardrail === null) ||
    (ctx.cross_verify_ran && crossVerify === null)
  ) {
    const reason =
      ctx.cross_verify_error || crossVerify?.verifier_error
        ? "Cross-verify failed (technical error). Output cannot be verified — human review required."
        : "Verifier reported it ran but produced no result (technical error). Output cannot be verified — human review required.";
    return {
      state: "VERIFIER_ERROR",
      reason,
      blocking_flags: [],
      requires_human_review: true,
      publish_allowed: false,
    };
  }

  // ── Rule 2: High-risk output must have both verifiers run ──
  // Guardrail-only, cross-verify-only, or both skipped is never sufficient.
  // This takes precedence over flag evaluation: an incomplete verification
  // cannot be BLOCKED, only escalated to human review.
  if (ctx.risk_level === "high" && (!ctx.guardrail_ran || !ctx.cross_verify_ran)) {
    let reason = "High-risk output was not verified by any checker — human review required.";
    if (ctx.guardrail_ran && !ctx.cross_verify_ran) {
      reason =
        "High-risk output was only verified by the guardrail (Tier 0). Cross-verify (Tier 1) is required — human review required.";
    } else if (!ctx.guardrail_ran && ctx.cross_verify_ran) {
      reason =
        "High-risk output was only verified by cross-verify (Tier 1). Guardrail (Tier 0) is required — human review required.";
    }
    return {
      state: "NEEDS_HUMAN_REVIEW",
      reason,
      blocking_flags: [],
      requires_human_review: true,
      publish_allowed: false,
    };
  }

  // ── Collect high-severity flags ──
  if (guardrail) {
    for (const flag of guardrail.flags) {
      if (flag.severity === "high") {
        blockingFlags.push({
          source: "guardrail",
          type: flag.type,
          severity: flag.severity,
          detail: flag.detail,
          citation: flag.citation,
        });
      }
    }
  }

  if (crossVerify) {
    for (const flag of crossVerify.flags) {
      if (flag.severity === "high") {
        blockingFlags.push({
          source: "cross_verify",
          type: flag.type,
          severity: flag.severity,
          detail: flag.detail,
          citation: flag.citation,
        });
      }
    }
  }

  // ── Rule 3: High-severity flags → BLOCKED (for high/medium risk) ──
  if (blockingFlags.length > 0 && ctx.risk_level !== "low") {
    const sources = blockingFlags.map((f) => `${f.source}:${f.type}`).join(", ");
    return {
      state: "BLOCKED",
      reason: `${blockingFlags.length} high-severity flag(s) from ${sources}. Output blocked — human review required.`,
      blocking_flags: blockingFlags,
      requires_human_review: true,
      publish_allowed: false,
    };
  }

  // ── Rule 4: High-severity flags on low-risk output → NEEDS_HUMAN_REVIEW ──
  if (blockingFlags.length > 0 && ctx.risk_level === "low") {
    return {
      state: "NEEDS_HUMAN_REVIEW",
      reason: `${blockingFlags.length} high-severity flag(s) on low-risk output — human review recommended.`,
      blocking_flags: blockingFlags,
      requires_human_review: true,
      publish_allowed: false,
    };
  }

  // ── Rule 5: Medium/low flags → VERIFIED_WITH_WARNINGS ──
  const warningCount =
    (guardrail?.flags.filter((f) => f.severity !== "high").length ?? 0) +
    (crossVerify?.flags.filter((f) => f.severity !== "high").length ?? 0);

  if (warningCount > 0) {
    return {
      state: "VERIFIED_WITH_WARNINGS",
      reason: `${warningCount} low/medium-severity warning(s). Output is verified but has minor flags.`,
      blocking_flags: [],
      requires_human_review: false,
      publish_allowed: true,
    };
  }

  // ── Rule 6: No flags → VERIFIED ──
  return {
    state: "VERIFIED",
    reason: "All checks passed.",
    blocking_flags: [],
    requires_human_review: false,
    publish_allowed: true,
  };
}

/**
 * Classify output risk level based on output type.
 */
export function classifyOutputRisk(outputType: string): OutputRiskLevel {
  const highRisk = [
    "schriftsatz",
    "draft",
    "mandantenantwort",
    "fristenauskunft",
    "legal_assessment",
    "final_memorandum",
    "claim_statement",
    "lawsuit_draft",
    "contract_review_final",
  ];
  const mediumRisk = [
    "forensic_report",
    "legal_grounding",
    "damage_analysis",
    "precedent_match",
    "admissibility_check",
    "evidence_quality",
    "cost_benefit",
    "settlement_analysis",
    "enforcement_analysis",
    "appeal_risk",
  ];

  const lower = outputType.toLowerCase();
  if (highRisk.some((r) => lower.includes(r))) return "high";
  if (mediumRisk.some((r) => lower.includes(r))) return "medium";
  return "low";
}

/**
 * Check if a verification state allows publishing.
 */
export function canPublish(state: VerificationState): boolean {
  return state === "VERIFIED" || state === "VERIFIED_WITH_WARNINGS";
}

/**
 * Check if a verification state requires human review.
 */
export function needsHumanReview(state: VerificationState): boolean {
  return state === "NEEDS_HUMAN_REVIEW" || state === "BLOCKED" || state === "VERIFIER_ERROR";
}
