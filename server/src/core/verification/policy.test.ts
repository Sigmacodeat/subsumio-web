import { describe, it, expect } from "vitest";
import {
  assertOutputActionAllowed,
  VerificationPolicyError,
  validateOverride,
  buildPolicyOutput,
  isPublishAction,
  isSafeAction,
  type PolicyOutput,
  type PolicyActor,
  type AttorneyOverride,
  type OutputAction,
} from "./policy.ts";
import type { VerificationState } from "./states.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

const VALID_HASH = "a".repeat(64);
const DIFFERENT_HASH = "b".repeat(64);

const actor: PolicyActor = {
  user_id: "user-123",
  user_email: "anwalt@kanzlei.at",
  brain_id: "brain-456",
  role: "anwalt",
};

function makeOutput(
  state: VerificationState,
  opts?: {
    content_hash?: string;
    receipt_hash?: string;
    id?: string;
  }
): PolicyOutput {
  return {
    id: opts?.id ?? "test-output",
    verification_state: state,
    content_hash: opts?.content_hash ?? VALID_HASH,
    receipt_hash: opts?.receipt_hash,
  };
}

function makeOverride(opts?: Partial<AttorneyOverride>): AttorneyOverride {
  return {
    user_id: "anwalt-789",
    reason: "Ich habe den Inhalt geprüft und freigegeben.",
    timestamp: new Date().toISOString(),
    output_hash: opts?.output_hash ?? VALID_HASH,
    ...opts,
  };
}

const ALL_ACTIONS: OutputAction[] = [
  "preview",
  "save_draft",
  "share_internal",
  "export_docx",
  "send_client",
  "file_court",
  "sign",
];

const PUBLISH_ACTIONS: OutputAction[] = [
  "share_internal",
  "export_docx",
  "send_client",
  "file_court",
  "sign",
];

// ─── Safe Actions (preview, save_draft) ───────────────────────────────────

describe("Safe actions (preview, save_draft)", () => {
  for (const action of ["preview", "save_draft"] as OutputAction[]) {
    for (const state of [
      "BLOCKED",
      "VERIFIER_ERROR",
      "NEEDS_HUMAN_REVIEW",
      "VERIFIED",
      "VERIFIED_WITH_WARNINGS",
    ] as VerificationState[]) {
      it(`${action} allows ${state}`, () => {
        const output = makeOutput(state);
        const decision = assertOutputActionAllowed(output, action, actor);
        expect(decision.allowed).toBe(true);
      });
    }

    it(`${action} allows even with hash mismatch`, () => {
      const output = makeOutput("BLOCKED", {
        content_hash: VALID_HASH,
        receipt_hash: DIFFERENT_HASH,
      });
      const decision = assertOutputActionAllowed(output, action, actor);
      expect(decision.allowed).toBe(true);
      expect(decision.receipt_invalidated).toBeUndefined();
    });
  }
});

// ─── BLOCKED / VERIFIER_ERROR ─────────────────────────────────────────────

describe("BLOCKED state", () => {
  for (const action of PUBLISH_ACTIONS) {
    it(`${action} is denied for BLOCKED (no override possible)`, () => {
      const output = makeOutput("BLOCKED");
      expect(() => assertOutputActionAllowed(output, action, actor)).toThrow(
        VerificationPolicyError
      );
      try {
        assertOutputActionAllowed(output, action, actor);
      } catch (e) {
        const err = e as VerificationPolicyError;
        expect(err.decision.allowed).toBe(false);
        expect(err.decision.state).toBe("BLOCKED");
        expect(err.decision.reason).toContain("BLOCKED");
        expect(err.decision.reason).toContain("no override possible");
      }
    });

    it(`${action} is denied for BLOCKED even with override`, () => {
      const output = makeOutput("BLOCKED");
      const override = makeOverride();
      expect(() => assertOutputActionAllowed(output, action, actor, override)).toThrow(
        VerificationPolicyError
      );
    });
  }
});

describe("VERIFIER_ERROR state", () => {
  for (const action of PUBLISH_ACTIONS) {
    it(`${action} is denied for VERIFIER_ERROR (no override possible)`, () => {
      const output = makeOutput("VERIFIER_ERROR");
      expect(() => assertOutputActionAllowed(output, action, actor)).toThrow(
        VerificationPolicyError
      );
      try {
        assertOutputActionAllowed(output, action, actor);
      } catch (e) {
        const err = e as VerificationPolicyError;
        expect(err.decision.allowed).toBe(false);
        expect(err.decision.state).toBe("VERIFIER_ERROR");
      }
    });
  }
});

// ─── NEEDS_HUMAN_REVIEW ───────────────────────────────────────────────────

describe("NEEDS_HUMAN_REVIEW state", () => {
  for (const action of PUBLISH_ACTIONS) {
    it(`${action} denied without override`, () => {
      const output = makeOutput("NEEDS_HUMAN_REVIEW");
      expect(() => assertOutputActionAllowed(output, action, actor)).toThrow(
        VerificationPolicyError
      );
      try {
        assertOutputActionAllowed(output, action, actor);
      } catch (e) {
        const err = e as VerificationPolicyError;
        expect(err.decision.reason).toContain("NEEDS_HUMAN_REVIEW");
        expect(err.decision.reason).toContain("attorney override");
      }
    });

    it(`${action} allowed with valid override`, () => {
      const output = makeOutput("NEEDS_HUMAN_REVIEW");
      const override = makeOverride();
      const decision = assertOutputActionAllowed(output, action, actor, override);
      expect(decision.allowed).toBe(true);
      expect(decision.override).toBeDefined();
      expect(decision.override?.user_id).toBe("anwalt-789");
    });

    it(`${action} denied with invalid override (missing user_id)`, () => {
      const output = makeOutput("NEEDS_HUMAN_REVIEW");
      const override = makeOverride({ user_id: "" });
      expect(() => assertOutputActionAllowed(output, action, actor, override)).toThrow(
        VerificationPolicyError
      );
      try {
        assertOutputActionAllowed(output, action, actor, override);
      } catch (e) {
        const err = e as VerificationPolicyError;
        expect(err.decision.reason).toContain("user_id is required");
      }
    });

    it(`${action} denied with invalid override (short reason)`, () => {
      const output = makeOutput("NEEDS_HUMAN_REVIEW");
      const override = makeOverride({ reason: "ok" });
      expect(() => assertOutputActionAllowed(output, action, actor, override)).toThrow(
        VerificationPolicyError
      );
      try {
        assertOutputActionAllowed(output, action, actor, override);
      } catch (e) {
        const err = e as VerificationPolicyError;
        expect(err.decision.reason).toContain("reason must be at least 10 characters");
      }
    });

    it(`${action} denied with hash mismatch in override`, () => {
      const output = makeOutput("NEEDS_HUMAN_REVIEW");
      const override = makeOverride({ output_hash: DIFFERENT_HASH });
      expect(() => assertOutputActionAllowed(output, action, actor, override)).toThrow(
        VerificationPolicyError
      );
      try {
        assertOutputActionAllowed(output, action, actor, override);
      } catch (e) {
        const err = e as VerificationPolicyError;
        expect(err.decision.reason).toContain("output_hash mismatch");
      }
    });
  }
});

// ─── VERIFIED / VERIFIED_WITH_WARNINGS ────────────────────────────────────

describe("VERIFIED state", () => {
  for (const action of PUBLISH_ACTIONS) {
    it(`${action} allowed for VERIFIED`, () => {
      const output = makeOutput("VERIFIED");
      const decision = assertOutputActionAllowed(output, action, actor);
      expect(decision.allowed).toBe(true);
      expect(decision.override).toBeUndefined();
    });
  }
});

describe("VERIFIED_WITH_WARNINGS state", () => {
  for (const action of PUBLISH_ACTIONS) {
    it(`${action} allowed for VERIFIED_WITH_WARNINGS`, () => {
      const output = makeOutput("VERIFIED_WITH_WARNINGS");
      const decision = assertOutputActionAllowed(output, action, actor);
      expect(decision.allowed).toBe(true);
    });
  }
});

// ─── Content hash mismatch (receipt invalidation) ─────────────────────────

describe("Content hash mismatch", () => {
  for (const action of PUBLISH_ACTIONS) {
    it(`${action} denied when receipt_hash != content_hash`, () => {
      const output = makeOutput("VERIFIED", {
        content_hash: VALID_HASH,
        receipt_hash: DIFFERENT_HASH,
      });
      expect(() => assertOutputActionAllowed(output, action, actor)).toThrow(
        VerificationPolicyError
      );
      try {
        assertOutputActionAllowed(output, action, actor);
      } catch (e) {
        const err = e as VerificationPolicyError;
        expect(err.decision.receipt_invalidated).toBe(true);
        expect(err.decision.reason).toContain("Content has changed");
        expect(err.decision.reason).toContain("Receipt invalidated");
      }
    });

    it(`${action} allowed when receipt_hash === content_hash`, () => {
      const output = makeOutput("VERIFIED", {
        content_hash: VALID_HASH,
        receipt_hash: VALID_HASH,
      });
      const decision = assertOutputActionAllowed(output, action, actor);
      expect(decision.allowed).toBe(true);
      expect(decision.receipt_invalidated).toBeUndefined();
    });

    it(`${action} allowed when no receipt_hash present`, () => {
      const output = makeOutput("VERIFIED", {
        content_hash: VALID_HASH,
        receipt_hash: undefined,
      });
      const decision = assertOutputActionAllowed(output, action, actor);
      expect(decision.allowed).toBe(true);
    });
  }
});

// ─── Override validation ──────────────────────────────────────────────────

describe("validateOverride", () => {
  it("valid override returns null", () => {
    const override = makeOverride();
    expect(validateOverride(override, VALID_HASH)).toBeNull();
  });

  it("missing user_id", () => {
    const override = makeOverride({ user_id: "" });
    expect(validateOverride(override, VALID_HASH)).toBe("user_id is required");
  });

  it("missing reason", () => {
    const override = makeOverride({ reason: "" });
    expect(validateOverride(override, VALID_HASH)).toBe("reason is required");
  });

  it("short reason", () => {
    const override = makeOverride({ reason: "short" });
    expect(validateOverride(override, VALID_HASH)).toContain("at least 10 characters");
  });

  it("invalid timestamp", () => {
    const override = makeOverride({ timestamp: "not-a-date" });
    expect(validateOverride(override, VALID_HASH)).toContain("timestamp");
  });

  it("invalid output_hash format", () => {
    const override = makeOverride({ output_hash: "short" });
    expect(validateOverride(override, VALID_HASH)).toContain("output_hash must be a valid SHA-256");
  });

  it("output_hash mismatch", () => {
    const override = makeOverride({ output_hash: DIFFERENT_HASH });
    expect(validateOverride(override, VALID_HASH)).toContain("output_hash mismatch");
  });
});

// ─── Helper functions ─────────────────────────────────────────────────────

describe("isPublishAction", () => {
  it("returns true for publish actions", () => {
    for (const action of PUBLISH_ACTIONS) {
      expect(isPublishAction(action)).toBe(true);
    }
  });

  it("returns false for safe actions", () => {
    expect(isPublishAction("preview")).toBe(false);
    expect(isPublishAction("save_draft")).toBe(false);
  });
});

describe("isSafeAction", () => {
  it("returns true for safe actions", () => {
    expect(isSafeAction("preview")).toBe(true);
    expect(isSafeAction("save_draft")).toBe(true);
  });

  it("returns false for publish actions", () => {
    for (const action of PUBLISH_ACTIONS) {
      expect(isSafeAction(action)).toBe(false);
    }
  });
});

describe("buildPolicyOutput", () => {
  it("builds output with all fields", () => {
    const output = buildPolicyOutput("doc-1", "VERIFIED", VALID_HASH, {
      receipt_hash: VALID_HASH,
      title: "Test Document",
    });
    expect(output.id).toBe("doc-1");
    expect(output.verification_state).toBe("VERIFIED");
    expect(output.content_hash).toBe(VALID_HASH);
    expect(output.receipt_hash).toBe(VALID_HASH);
    expect(output.title).toBe("Test Document");
  });

  it("builds output without optional fields", () => {
    const output = buildPolicyOutput("doc-2", "BLOCKED", VALID_HASH);
    expect(output.receipt_hash).toBeUndefined();
    expect(output.title).toBeUndefined();
  });
});

// ─── Cross-action matrix ──────────────────────────────────────────────────

describe("Action × State matrix (exhaustive)", () => {
  const states: VerificationState[] = [
    "VERIFIED",
    "VERIFIED_WITH_WARNINGS",
    "NEEDS_HUMAN_REVIEW",
    "BLOCKED",
    "VERIFIER_ERROR",
  ];

  for (const action of ALL_ACTIONS) {
    for (const state of states) {
      const isSafe = isSafeAction(action);
      const isFatal = state === "BLOCKED" || state === "VERIFIER_ERROR";
      const isReview = state === "NEEDS_HUMAN_REVIEW";
      const isPublishable = state === "VERIFIED" || state === "VERIFIED_WITH_WARNINGS";

      it(`${action} × ${state} → ${isSafe || isPublishable ? "ALLOW" : "DENY"}`, () => {
        const output = makeOutput(state);
        if (isSafe || isPublishable) {
          const decision = assertOutputActionAllowed(output, action, actor);
          expect(decision.allowed).toBe(true);
        } else if (isFatal) {
          expect(() => assertOutputActionAllowed(output, action, actor)).toThrow(
            VerificationPolicyError
          );
        } else if (isReview) {
          expect(() => assertOutputActionAllowed(output, action, actor)).toThrow(
            VerificationPolicyError
          );
          // With override
          const override = makeOverride();
          const decision = assertOutputActionAllowed(output, action, actor, override);
          expect(decision.allowed).toBe(true);
        }
      });
    }
  }
});
