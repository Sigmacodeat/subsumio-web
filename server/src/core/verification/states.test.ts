import { describe, it, expect } from "vitest";
import {
  resolveVerificationState,
  classifyOutputRisk,
  canPublish,
  needsHumanReview,
  type VerificationContext,
} from "./states.ts";
import type { GuardrailResult, GuardrailFlag } from "../citation-guardrail.ts";
import type { CrossVerifyResult, CrossVerifyFlag } from "../think/cross-verify.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeGuardrailResult(overrides: Partial<GuardrailResult> = {}): GuardrailResult {
  return {
    passed: true,
    flags: [],
    all_citations: [],
    ungrounded_citations: [],
    non_existent_laws: [],
    fabricated_references: [],
    hedging_phrases: [],
    cross_law_contamination: [],
    unsubstantiated_uncertainty_phrases: [],
    context_citations: [],
    retrieved_laws: [],
    answer_length: 100,
    context_length: 500,
    check_count: 5,
    ...overrides,
  };
}

function makeCrossVerifyResult(overrides: Partial<CrossVerifyResult> = {}): CrossVerifyResult {
  return {
    clean: true,
    flags: [],
    verified_citations: [],
    flagged_citations: [],
    ...overrides,
  };
}

function makeHighSeverityGuardrailFlag(
  type: string = "ungrounded_citation",
  citation: string = "§ 999 BGB"
): GuardrailFlag {
  return {
    type: type as GuardrailFlag["type"],
    detail: `Citation "${citation}" not found in context`,
    citation,
    severity: "high",
  };
}

function makeHighSeverityCrossVerifyFlag(
  type: string = "ungrounded_citation",
  citation: string = "§ 999 BGB"
): CrossVerifyFlag {
  return {
    type,
    detail: `Citation "${citation}" not found in context`,
    citation,
    severity: "high",
  };
}

const lowRiskCtx: VerificationContext = {
  risk_level: "low",
  guardrail_ran: true,
  cross_verify_ran: true,
};

const highRiskCtx: VerificationContext = {
  risk_level: "high",
  guardrail_ran: true,
  cross_verify_ran: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe("resolveVerificationState", () => {
  describe("VERIFIED (clean output)", () => {
    it("returns VERIFIED when both checks pass on low-risk output", () => {
      const decision = resolveVerificationState(
        makeGuardrailResult(),
        makeCrossVerifyResult(),
        lowRiskCtx
      );
      expect(decision.state).toBe("VERIFIED");
      expect(decision.publish_allowed).toBe(true);
      expect(decision.requires_human_review).toBe(false);
    });

    it("returns VERIFIED when both checks pass on high-risk output", () => {
      const decision = resolveVerificationState(
        makeGuardrailResult(),
        makeCrossVerifyResult(),
        highRiskCtx
      );
      expect(decision.state).toBe("VERIFIED");
      expect(decision.publish_allowed).toBe(true);
    });
  });

  describe("VERIFIER_ERROR (technical failure)", () => {
    it("returns VERIFIER_ERROR when cross_verify_error is true", () => {
      const decision = resolveVerificationState(makeGuardrailResult(), null, {
        ...highRiskCtx,
        cross_verify_error: true,
      });
      expect(decision.state).toBe("VERIFIER_ERROR");
      expect(decision.publish_allowed).toBe(false);
      expect(decision.requires_human_review).toBe(true);
    });

    it("returns VERIFIER_ERROR even if guardrail passed", () => {
      const decision = resolveVerificationState(makeGuardrailResult({ passed: true }), null, {
        ...highRiskCtx,
        cross_verify_error: true,
        cross_verify_ran: false,
      });
      expect(decision.state).toBe("VERIFIER_ERROR");
      expect(decision.publish_allowed).toBe(false);
    });

    it("returns VERIFIER_ERROR when cross-verify result has verifier_error flag", () => {
      const cvResult = makeCrossVerifyResult({
        clean: false,
        verifier_error: true,
        flags: [
          {
            type: "verifier_error",
            detail: "Cross-verify failed",
            severity: "high",
          },
        ],
      });
      const decision = resolveVerificationState(makeGuardrailResult(), cvResult, highRiskCtx);
      expect(decision.state).toBe("VERIFIER_ERROR");
      expect(decision.publish_allowed).toBe(false);
    });
  });

  describe("BLOCKED (high-severity flags on high/medium risk)", () => {
    it("returns BLOCKED when guardrail has high-severity flag on high-risk output", () => {
      const guardrail = makeGuardrailResult({
        passed: false,
        flags: [makeHighSeverityGuardrailFlag()],
      });
      const decision = resolveVerificationState(guardrail, makeCrossVerifyResult(), highRiskCtx);
      expect(decision.state).toBe("BLOCKED");
      expect(decision.publish_allowed).toBe(false);
      expect(decision.requires_human_review).toBe(true);
      expect(decision.blocking_flags).toHaveLength(1);
      expect(decision.blocking_flags[0]!.source).toBe("guardrail");
    });

    it("returns BLOCKED when cross-verify has high-severity flag on high-risk output", () => {
      const cvResult = makeCrossVerifyResult({
        clean: false,
        flags: [makeHighSeverityCrossVerifyFlag()],
      });
      const decision = resolveVerificationState(makeGuardrailResult(), cvResult, highRiskCtx);
      expect(decision.state).toBe("BLOCKED");
      expect(decision.publish_allowed).toBe(false);
      expect(decision.blocking_flags[0]!.source).toBe("cross_verify");
    });

    it("returns BLOCKED when both have high-severity flags on medium-risk output", () => {
      const guardrail = makeGuardrailResult({
        passed: false,
        flags: [makeHighSeverityGuardrailFlag("non_existent_law", "XYZ")],
      });
      const cvResult = makeCrossVerifyResult({
        clean: false,
        flags: [makeHighSeverityCrossVerifyFlag("fabricated_reference")],
      });
      const decision = resolveVerificationState(guardrail, cvResult, {
        ...lowRiskCtx,
        risk_level: "medium",
      });
      expect(decision.state).toBe("BLOCKED");
      expect(decision.blocking_flags).toHaveLength(2);
    });
  });

  describe("NEEDS_HUMAN_REVIEW (high-severity on low-risk or missing verification)", () => {
    it("returns NEEDS_HUMAN_REVIEW when high-severity flag on low-risk output", () => {
      const guardrail = makeGuardrailResult({
        passed: false,
        flags: [makeHighSeverityGuardrailFlag()],
      });
      const decision = resolveVerificationState(guardrail, makeCrossVerifyResult(), lowRiskCtx);
      expect(decision.state).toBe("NEEDS_HUMAN_REVIEW");
      expect(decision.publish_allowed).toBe(false);
    });

    it("returns NEEDS_HUMAN_REVIEW when high-risk output has no verification at all", () => {
      const decision = resolveVerificationState(null, null, {
        ...highRiskCtx,
        guardrail_ran: false,
        cross_verify_ran: false,
      });
      expect(decision.state).toBe("NEEDS_HUMAN_REVIEW");
      expect(decision.publish_allowed).toBe(false);
    });
  });

  describe("VERIFIED_WITH_WARNINGS (medium/low flags)", () => {
    it("returns VERIFIED_WITH_WARNINGS when guardrail has only medium flags", () => {
      const guardrail = makeGuardrailResult({
        passed: true, // passed = no high-severity
        flags: [
          {
            type: "hedging",
            detail: "Model hedging",
            severity: "medium",
          },
        ],
      });
      const decision = resolveVerificationState(guardrail, makeCrossVerifyResult(), highRiskCtx);
      expect(decision.state).toBe("VERIFIED_WITH_WARNINGS");
      expect(decision.publish_allowed).toBe(true);
      expect(decision.requires_human_review).toBe(false);
    });

    it("returns VERIFIED_WITH_WARNINGS when cross-verify has low flags", () => {
      const cvResult = makeCrossVerifyResult({
        clean: false,
        flags: [
          {
            type: "wrong_application",
            detail: "Minor misapplication",
            severity: "low",
          },
        ],
      });
      const decision = resolveVerificationState(makeGuardrailResult(), cvResult, highRiskCtx);
      expect(decision.state).toBe("VERIFIED_WITH_WARNINGS");
      expect(decision.publish_allowed).toBe(true);
    });

    it("returns NEEDS_HUMAN_REVIEW on high-risk when cross-verify did not run but guardrail passed", () => {
      const decision = resolveVerificationState(makeGuardrailResult(), null, {
        ...highRiskCtx,
        cross_verify_ran: false,
      });
      expect(decision.state).toBe("NEEDS_HUMAN_REVIEW");
      expect(decision.publish_allowed).toBe(false);
      expect(decision.requires_human_review).toBe(true);
    });
  });
});

// ─── Risk × guardrail × cross_verify × error matrix ──────────────────────

const mediumRiskCtx: VerificationContext = {
  risk_level: "medium",
  guardrail_ran: true,
  cross_verify_ran: true,
};

describe("resolveVerificationState matrix", () => {
  it.each([
    // high risk: both must run and succeed
    [
      "high + both ran + clean => VERIFIED",
      makeGuardrailResult(),
      makeCrossVerifyResult(),
      highRiskCtx,
      { state: "VERIFIED", publish_allowed: true },
    ],
    [
      "high + both ran + high guardrail flag => BLOCKED",
      makeGuardrailResult({
        passed: false,
        flags: [makeHighSeverityGuardrailFlag()],
      }),
      makeCrossVerifyResult(),
      highRiskCtx,
      { state: "BLOCKED", publish_allowed: false },
    ],
    [
      "high + both ran + high cross-verify flag => BLOCKED",
      makeGuardrailResult(),
      makeCrossVerifyResult({
        clean: false,
        flags: [makeHighSeverityCrossVerifyFlag()],
      }),
      highRiskCtx,
      { state: "BLOCKED", publish_allowed: false },
    ],
    [
      "high + both ran + low guardrail flag => VERIFIED_WITH_WARNINGS",
      makeGuardrailResult({
        flags: [{ type: "hedging", detail: "Minor hedging", severity: "low" }],
      }),
      makeCrossVerifyResult(),
      highRiskCtx,
      { state: "VERIFIED_WITH_WARNINGS", publish_allowed: true },
    ],
    // high risk: guardrail-only
    [
      "high + guardrail-only + clean => NEEDS_HUMAN_REVIEW",
      makeGuardrailResult(),
      null,
      { ...highRiskCtx, cross_verify_ran: false },
      { state: "NEEDS_HUMAN_REVIEW", publish_allowed: false },
    ],
    [
      "high + guardrail-only + high guardrail flag => NEEDS_HUMAN_REVIEW",
      makeGuardrailResult({
        passed: false,
        flags: [makeHighSeverityGuardrailFlag()],
      }),
      null,
      { ...highRiskCtx, cross_verify_ran: false },
      { state: "NEEDS_HUMAN_REVIEW", publish_allowed: false },
    ],
    // high risk: cross-verify-only
    [
      "high + cross-verify-only + clean => NEEDS_HUMAN_REVIEW",
      null,
      makeCrossVerifyResult(),
      { ...highRiskCtx, guardrail_ran: false },
      { state: "NEEDS_HUMAN_REVIEW", publish_allowed: false },
    ],
    [
      "high + cross-verify-only + high cross-verify flag => NEEDS_HUMAN_REVIEW",
      null,
      makeCrossVerifyResult({
        clean: false,
        flags: [makeHighSeverityCrossVerifyFlag()],
      }),
      { ...highRiskCtx, guardrail_ran: false },
      { state: "NEEDS_HUMAN_REVIEW", publish_allowed: false },
    ],
    // high risk: both skipped
    [
      "high + both skipped => NEEDS_HUMAN_REVIEW",
      null,
      null,
      { risk_level: "high", guardrail_ran: false, cross_verify_ran: false },
      { state: "NEEDS_HUMAN_REVIEW", publish_allowed: false },
    ],
    // high risk: verifier errors
    [
      "high + cross_verify_error => VERIFIER_ERROR",
      makeGuardrailResult(),
      makeCrossVerifyResult(),
      { ...highRiskCtx, cross_verify_error: true },
      { state: "VERIFIER_ERROR", publish_allowed: false },
    ],
    [
      "high + cross-verify verifier_error => VERIFIER_ERROR",
      makeGuardrailResult(),
      makeCrossVerifyResult({
        clean: false,
        verifier_error: true,
        flags: [{ type: "verifier_error", detail: "Verifier failed", severity: "high" }],
      }),
      highRiskCtx,
      { state: "VERIFIER_ERROR", publish_allowed: false },
    ],
    [
      "high + guardrail_ran but result null => VERIFIER_ERROR",
      null,
      makeCrossVerifyResult(),
      { ...highRiskCtx, guardrail_ran: true },
      { state: "VERIFIER_ERROR", publish_allowed: false },
    ],
    [
      "high + cross_verify_ran but result null => VERIFIER_ERROR",
      makeGuardrailResult(),
      null,
      { ...highRiskCtx, cross_verify_ran: true },
      { state: "VERIFIER_ERROR", publish_allowed: false },
    ],
    // medium risk
    [
      "medium + both ran + clean => VERIFIED",
      makeGuardrailResult(),
      makeCrossVerifyResult(),
      mediumRiskCtx,
      { state: "VERIFIED", publish_allowed: true },
    ],
    [
      "medium + both ran + high guardrail flag => BLOCKED",
      makeGuardrailResult({
        passed: false,
        flags: [makeHighSeverityGuardrailFlag()],
      }),
      makeCrossVerifyResult(),
      mediumRiskCtx,
      { state: "BLOCKED", publish_allowed: false },
    ],
    [
      "medium + guardrail-only + clean => VERIFIED",
      makeGuardrailResult(),
      null,
      { ...mediumRiskCtx, cross_verify_ran: false },
      { state: "VERIFIED", publish_allowed: true },
    ],
    [
      "medium + cross-verify-only + clean => VERIFIED",
      null,
      makeCrossVerifyResult(),
      { ...mediumRiskCtx, guardrail_ran: false },
      { state: "VERIFIED", publish_allowed: true },
    ],
    [
      "medium + cross_verify_error => VERIFIER_ERROR",
      makeGuardrailResult(),
      makeCrossVerifyResult(),
      { ...mediumRiskCtx, cross_verify_error: true },
      { state: "VERIFIER_ERROR", publish_allowed: false },
    ],
    // low risk
    [
      "low + both ran + clean => VERIFIED",
      makeGuardrailResult(),
      makeCrossVerifyResult(),
      lowRiskCtx,
      { state: "VERIFIED", publish_allowed: true },
    ],
    [
      "low + both ran + high guardrail flag => NEEDS_HUMAN_REVIEW",
      makeGuardrailResult({
        passed: false,
        flags: [makeHighSeverityGuardrailFlag()],
      }),
      makeCrossVerifyResult(),
      lowRiskCtx,
      { state: "NEEDS_HUMAN_REVIEW", publish_allowed: false },
    ],
    [
      "low + guardrail-only + clean => VERIFIED",
      makeGuardrailResult(),
      null,
      { ...lowRiskCtx, cross_verify_ran: false },
      { state: "VERIFIED", publish_allowed: true },
    ],
    [
      "low + cross_verify_error => VERIFIER_ERROR",
      makeGuardrailResult(),
      makeCrossVerifyResult(),
      { ...lowRiskCtx, cross_verify_error: true },
      { state: "VERIFIER_ERROR", publish_allowed: false },
    ],
  ] as const)("%s", (_name, guardrail, crossVerify, ctx, expected) => {
    const decision = resolveVerificationState(
      guardrail as GuardrailResult | null,
      crossVerify as CrossVerifyResult | null,
      ctx as VerificationContext
    );
    expect(decision.state).toBe(expected.state);
    expect(decision.publish_allowed).toBe(expected.publish_allowed);
    expect(decision.requires_human_review).toBe(
      expected.state === "NEEDS_HUMAN_REVIEW" ||
        expected.state === "BLOCKED" ||
        expected.state === "VERIFIER_ERROR"
    );
  });

  it("ignores any caller-provided publish_allowed override", () => {
    const ctx = {
      ...highRiskCtx,
      cross_verify_ran: false,
      publish_allowed: true,
    } as unknown as VerificationContext;
    const decision = resolveVerificationState(makeGuardrailResult(), null, ctx);
    expect(decision.state).toBe("NEEDS_HUMAN_REVIEW");
    expect(decision.publish_allowed).toBe(false);
  });
});

describe("classifyOutputRisk", () => {
  it("classifies schriftsatz as high risk", () => {
    expect(classifyOutputRisk("schriftsatz")).toBe("high");
  });

  it("classifies draft as high risk", () => {
    expect(classifyOutputRisk("draft")).toBe("high");
  });

  it("classifies mandantenantwort as high risk", () => {
    expect(classifyOutputRisk("mandantenantwort")).toBe("high");
  });

  it("classifies fristenauskunft as high risk", () => {
    expect(classifyOutputRisk("fristenauskunft")).toBe("high");
  });

  it("classifies forensic_report as medium risk", () => {
    expect(classifyOutputRisk("forensic_report")).toBe("medium");
  });

  it("classifies legal_grounding as medium risk", () => {
    expect(classifyOutputRisk("legal_grounding")).toBe("medium");
  });

  it("classifies unknown output as low risk", () => {
    expect(classifyOutputRisk("unknown")).toBe("low");
  });

  it("classifies empty string as low risk", () => {
    expect(classifyOutputRisk("")).toBe("low");
  });
});

describe("canPublish", () => {
  it("allows publishing VERIFIED", () => {
    expect(canPublish("VERIFIED")).toBe(true);
  });

  it("allows publishing VERIFIED_WITH_WARNINGS", () => {
    expect(canPublish("VERIFIED_WITH_WARNINGS")).toBe(true);
  });

  it("blocks publishing NEEDS_HUMAN_REVIEW", () => {
    expect(canPublish("NEEDS_HUMAN_REVIEW")).toBe(false);
  });

  it("blocks publishing BLOCKED", () => {
    expect(canPublish("BLOCKED")).toBe(false);
  });

  it("blocks publishing VERIFIER_ERROR", () => {
    expect(canPublish("VERIFIER_ERROR")).toBe(false);
  });
});

describe("needsHumanReview", () => {
  it("does not require review for VERIFIED", () => {
    expect(needsHumanReview("VERIFIED")).toBe(false);
  });

  it("does not require review for VERIFIED_WITH_WARNINGS", () => {
    expect(needsHumanReview("VERIFIED_WITH_WARNINGS")).toBe(false);
  });

  it("requires review for NEEDS_HUMAN_REVIEW", () => {
    expect(needsHumanReview("NEEDS_HUMAN_REVIEW")).toBe(true);
  });

  it("requires review for BLOCKED", () => {
    expect(needsHumanReview("BLOCKED")).toBe(true);
  });

  it("requires review for VERIFIER_ERROR", () => {
    expect(needsHumanReview("VERIFIER_ERROR")).toBe(true);
  });
});

// ─── Fail-closed invariant tests ──────────────────────────────────────────

describe("Fail-closed invariants", () => {
  it("NEVER returns VERIFIED when verifier error occurred", () => {
    // Even with a perfect guardrail result
    const decision = resolveVerificationState(
      makeGuardrailResult({ passed: true }),
      makeCrossVerifyResult({ clean: true }),
      { ...highRiskCtx, cross_verify_error: true }
    );
    expect(decision.state).not.toBe("VERIFIED");
    expect(decision.state).toBe("VERIFIER_ERROR");
  });

  it("NEVER returns VERIFIED when high-severity flags exist on high-risk output", () => {
    const guardrail = makeGuardrailResult({
      passed: false,
      flags: [makeHighSeverityGuardrailFlag()],
    });
    const decision = resolveVerificationState(
      guardrail,
      makeCrossVerifyResult({ clean: true }),
      highRiskCtx
    );
    expect(decision.state).not.toBe("VERIFIED");
    expect(decision.publish_allowed).toBe(false);
  });

  it("NEVER returns VERIFIED for high-risk output without any verification", () => {
    const decision = resolveVerificationState(null, null, {
      risk_level: "high",
      guardrail_ran: false,
      cross_verify_ran: false,
    });
    expect(decision.state).not.toBe("VERIFIED");
    expect(decision.publish_allowed).toBe(false);
  });
});
