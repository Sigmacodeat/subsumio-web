// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  contentHashOf,
  isAiPage,
  pageBody,
  signRelease,
  stateFromGrounding,
  verifyRelease,
} from "./ai-release";
import type { GroundingMetadata } from "./citation-gate-client";

const base: GroundingMetadata = {
  citations_verified: 2,
  citations_unverified: 0,
  corpus_checked: true,
  grounded_citations: [],
  analyzed_at: "2026-09-24T10:00:00.000Z",
  has_unverified: false,
};

describe("stateFromGrounding", () => {
  it("all citations verified → VERIFIED", () => {
    expect(stateFromGrounding(base)).toBe("VERIFIED");
  });
  it("unverified or misattributed citations → NEEDS_HUMAN_REVIEW", () => {
    expect(stateFromGrounding({ ...base, citations_unverified: 1 })).toBe("NEEDS_HUMAN_REVIEW");
    expect(stateFromGrounding({ ...base, citations_misgrounded: 1 })).toBe("NEEDS_HUMAN_REVIEW");
  });
  it("a failed check is never releasable", () => {
    expect(stateFromGrounding({ ...base, check_failed: true })).toBe("VERIFIER_ERROR");
    expect(stateFromGrounding({ ...base, corpus_checked: false })).toBe("VERIFIER_ERROR");
  });
});

describe("release token", () => {
  const rel = {
    brainId: "b1",
    contentHash: contentHashOf("Text"),
    state: "VERIFIED" as const,
    releasedBy: "u1",
    releasedAt: "2026-09-24T10:00:00.000Z",
    citationsVerified: 1,
    citationsUnverified: 0,
  };

  it("verifies for the same brain and text", () => {
    expect(
      verifyRelease(signRelease(rel), { brainId: "b1", contentHash: contentHashOf("Text") })
    ).toMatchObject({ ok: true });
  });
  it("rejects other text, other brain, missing and tampered tokens", () => {
    const t = signRelease(rel);
    expect(verifyRelease(t, { brainId: "b1", contentHash: contentHashOf("Text!") })).toEqual({
      ok: false,
      reason: "content_changed",
    });
    expect(verifyRelease(t, { brainId: "b2", contentHash: rel.contentHash })).toEqual({
      ok: false,
      reason: "other_brain",
    });
    expect(verifyRelease(undefined, { brainId: "b1", contentHash: rel.contentHash }).ok).toBe(
      false
    );
    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...rel, brainId: "b2" })).toString("base64url");
    expect(
      verifyRelease(`${forged}.${sig}`, { brainId: "b2", contentHash: rel.contentHash })
    ).toEqual({ ok: false, reason: "invalid" });
  });
  it("NEEDS_HUMAN_REVIEW is only a release with an override reason", () => {
    const expected = { brainId: "b1", contentHash: rel.contentHash };
    expect(verifyRelease(signRelease({ ...rel, state: "NEEDS_HUMAN_REVIEW" }), expected).ok).toBe(
      false
    );
    expect(
      verifyRelease(
        signRelease({ ...rel, state: "NEEDS_HUMAN_REVIEW", overrideReason: "händisch geprüft" }),
        expected
      ).ok
    ).toBe(true);
    expect(verifyRelease(signRelease({ ...rel, state: "BLOCKED" }), expected).ok).toBe(false);
  });
});

describe("page helpers", () => {
  it("AI origin comes from the stored frontmatter only", () => {
    expect(isAiPage({ ai_generated: true })).toBe(true);
    expect(isAiPage({ ai_generated: "true" })).toBe(false);
    expect(isAiPage(undefined)).toBe(false);
  });
  it("page body prefers compiled_truth like every export path", () => {
    expect(pageBody({ compiled_truth: "a", content: "b" })).toBe("a");
    expect(pageBody({ content: "b" })).toBe("b");
  });
});
