import { describe, expect, it } from "vitest";
import {
  ALL_WORK_PRODUCT_TYPES,
  buildWorkProductReceipt,
  computeOutputHash,
  computePromptHash,
  invalidateReceipt,
  isReceiptValid,
  receiptStatusSummary,
  resolveReceiptState,
  sha256Hex,
  type WorkProductReceipt,
} from "@/lib/work-product-receipts";

describe("work-product-receipts", () => {
  describe("sha256Hex", () => {
    it("produces a 64-char hex digest", () => {
      const hash = sha256Hex("hello");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    });

    it("is sensitive to input changes", () => {
      expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
    });
  });

  describe("computeOutputHash", () => {
    it("hashes strings deterministically", () => {
      const a = computeOutputHash("output");
      const b = computeOutputHash("output");
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it("hashes objects with stable key ordering", () => {
      const a = computeOutputHash({ b: 2, a: 1 });
      const b = computeOutputHash({ a: 1, b: 2 });
      expect(a).toBe(b);
    });

    it("produces different hashes for different content", () => {
      expect(computeOutputHash("foo")).not.toBe(computeOutputHash("bar"));
    });
  });

  describe("computePromptHash", () => {
    it("hashes system + user prompt", () => {
      const a = computePromptHash("sys", "user");
      const b = computePromptHash("sys", "user");
      expect(a).toBe(b);
      expect(computePromptHash("sys", "user")).not.toBe(computePromptHash("sys", "usr"));
    });
  });

  describe("resolveReceiptState", () => {
    it("returns VERIFIED when all checks pass", () => {
      expect(
        resolveReceiptState([{ name: "citation", description: "", passed: true, severity: "info" }])
      ).toBe("VERIFIED");
    });

    it("returns VERIFIED_WITH_WARNINGS for failed warning checks", () => {
      expect(
        resolveReceiptState([
          {
            name: "citation",
            description: "",
            passed: false,
            severity: "warning",
          },
        ])
      ).toBe("VERIFIED_WITH_WARNINGS");
    });

    it("returns NEEDS_HUMAN_REVIEW for failed error checks", () => {
      expect(
        resolveReceiptState([
          {
            name: "grounding",
            description: "",
            passed: false,
            severity: "error",
          },
        ])
      ).toBe("NEEDS_HUMAN_REVIEW");
    });

    it("returns BLOCKED for critical failed checks", () => {
      expect(
        resolveReceiptState([
          {
            name: "policy",
            description: "",
            passed: false,
            severity: "critical",
          },
        ])
      ).toBe("BLOCKED");
    });

    it("flags push state to BLOCKED over warnings", () => {
      expect(
        resolveReceiptState(
          [
            {
              name: "citation",
              description: "",
              passed: true,
              severity: "info",
            },
          ],
          ["GUARDRAIL_FLAGGED_HIGH_SEVERITY"]
        )
      ).toBe("BLOCKED");
    });

    it("fail-closed when no checks are provided", () => {
      expect(resolveReceiptState([])).toBe("NEEDS_HUMAN_REVIEW");
    });
  });

  describe("buildWorkProductReceipt", () => {
    it("builds a receipt with version 1 when no previous receipt", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "case-123/memo",
        output: "memo text",
        brain_id: "brain-1",
        checks: [{ name: "citation", description: "", passed: true, severity: "info" }],
      });
      expect(r.version).toBe(1);
      expect(r.state).toBe("VERIFIED");
      expect(r.output_hash).toBe(computeOutputHash("memo text"));
      expect(r.output_length).toBe(9);
      expect(r.previous_receipt_id).toBeUndefined();
    });

    it("increments version when previous receipt is provided", () => {
      const previous = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "case-123/memo",
        output: "v1",
        brain_id: "brain-1",
      });
      const next = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "case-123/memo",
        output: "v2",
        brain_id: "brain-1",
        previousReceipt: previous,
      });
      expect(next.version).toBe(2);
      expect(next.previous_receipt_id).toBe(previous.receipt_id);
    });

    it("computes prompt hashes from prompts", () => {
      const r = buildWorkProductReceipt({
        product_type: "redline",
        product_ref: "contract-1",
        output: { redlines: [] },
        brain_id: "brain-1",
        prompts: [{ system: "sys", user: "user" }, { user: "user2" }],
      });
      expect(r.prompt_hashes).toHaveLength(2);
      expect(r.prompt_hashes[0]).toBe(computePromptHash("sys", "user"));
      expect(r.prompt_hashes[1]).toBe(computePromptHash("", "user2"));
    });

    it("uses explicit state when provided", () => {
      const r = buildWorkProductReceipt({
        product_type: "schriftsatz",
        product_ref: "case-1",
        output: "text",
        brain_id: "brain-1",
        state: "BLOCKED",
      });
      expect(r.state).toBe("BLOCKED");
    });
  });

  describe("isReceiptValid", () => {
    it("returns true when output hash matches and not invalidated", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
      });
      expect(isReceiptValid(r, "content")).toBe(true);
    });

    it("returns false when output hash mismatches", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
      });
      expect(isReceiptValid(r, "tampered")).toBe(false);
    });

    it("returns false when receipt is invalidated", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
      });
      const invalidated = invalidateReceipt(r, "new-receipt-id");
      expect(isReceiptValid(invalidated, "content")).toBe(false);
    });
  });

  describe("invalidateReceipt", () => {
    it("returns a new receipt with invalidated fields", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
      });
      const invalidated = invalidateReceipt(r, "r2");
      expect(invalidated.invalidated_by).toBe("r2");
      expect(invalidated.invalidated_at).toBeDefined();
      expect(invalidated.receipt_id).toBe(r.receipt_id);
    });
  });

  describe("receiptStatusSummary", () => {
    it("summarises a valid receipt", () => {
      const r = buildWorkProductReceipt({
        product_type: "redline",
        product_ref: "x",
        output: "content",
        brain_id: "b",
        checks: [
          {
            name: "citation",
            description: "",
            passed: false,
            severity: "warning",
          },
        ],
      });
      const summary = receiptStatusSummary(r);
      expect(summary.state).toBe("VERIFIED_WITH_WARNINGS");
      expect(summary.failedChecks).toHaveLength(1);
      expect(summary.valid).toBe(true);
      expect(summary.version).toBe(1);
    });
  });

  describe("ALL_WORK_PRODUCT_TYPES", () => {
    it("contains all six product types", () => {
      expect(ALL_WORK_PRODUCT_TYPES.sort()).toEqual(
        ["draft", "memo", "fristenreport", "vertragsreview", "redline", "schriftsatz"].sort()
      );
    });
  });

  // ── Tamper-evidence tests ─────────────────────────────────────────────

  describe("tamper evidence", () => {
    it("detects single-character content change", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "This is the original content.",
        brain_id: "b",
      });
      expect(isReceiptValid(r, "This is the original content.")).toBe(true);
      expect(isReceiptValid(r, "This is the original content!")).toBe(false);
    });

    it("detects whitespace-only change", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content with  spaces",
        brain_id: "b",
      });
      expect(isReceiptValid(r, "content with spaces")).toBe(false);
    });

    it("detects object key reordering as NOT tampering (stable hash)", () => {
      const r = buildWorkProductReceipt({
        product_type: "redline",
        product_ref: "x",
        output: { z: 3, a: 1, m: 2 },
        brain_id: "b",
      });
      expect(isReceiptValid(r, { a: 1, m: 2, z: 3 })).toBe(true);
    });

    it("detects nested object mutation", () => {
      const original = { redlines: [{ text: "original", risk: "high" }] };
      const tampered = { redlines: [{ text: "original", risk: "low" }] };
      const r = buildWorkProductReceipt({
        product_type: "redline",
        product_ref: "x",
        output: original,
        brain_id: "b",
      });
      expect(isReceiptValid(r, tampered)).toBe(false);
    });

    it("detects array element reordering as tampering", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: [1, 2, 3],
        brain_id: "b",
      });
      expect(isReceiptValid(r, [3, 2, 1])).toBe(false);
    });

    it("receipt ID is a valid UUID", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
      });
      expect(r.receipt_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it("output hash is deterministic across multiple builds", () => {
      const opts = {
        product_type: "memo" as const,
        product_ref: "x",
        output: "same content",
        brain_id: "b",
        now: "2025-01-01T00:00:00Z",
      };
      const r1 = buildWorkProductReceipt(opts);
      const r2 = buildWorkProductReceipt(opts);
      expect(r1.output_hash).toBe(r2.output_hash);
      expect(r1.receipt_id).not.toBe(r2.receipt_id);
    });
  });

  // ── Mutation / invalidation chain tests ───────────────────────────────

  describe("invalidation chain", () => {
    it("chain of 3 versions links correctly", () => {
      const v1 = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "case-1",
        output: "version 1",
        brain_id: "b",
      });
      const v2 = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "case-1",
        output: "version 2",
        brain_id: "b",
        previousReceipt: v1,
      });
      const v3 = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "case-1",
        output: "version 3",
        brain_id: "b",
        previousReceipt: v2,
      });

      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
      expect(v2.previous_receipt_id).toBe(v1.receipt_id);
      expect(v3.previous_receipt_id).toBe(v2.receipt_id);
      expect(v3.previous_receipt_id).not.toBe(v1.receipt_id);
    });

    it("invalidated receipt preserves original receipt_id", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
      });
      const invalidated = invalidateReceipt(r, "new-id");
      expect(invalidated.receipt_id).toBe(r.receipt_id);
      expect(invalidated.invalidated_by).toBe("new-id");
      expect(invalidated.invalidated_at).toBeDefined();
    });

    it("invalidation does not mutate original receipt", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
      });
      const originalInvalidatedAt = r.invalidated_at;
      invalidateReceipt(r, "new-id");
      expect(r.invalidated_at).toBe(originalInvalidatedAt);
    });

    it("same content produces same output hash across versions", () => {
      const v1 = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "same",
        brain_id: "b",
      });
      const v2 = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "same",
        brain_id: "b",
        previousReceipt: v1,
      });
      expect(v1.output_hash).toBe(v2.output_hash);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty string output", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "",
        brain_id: "b",
      });
      expect(r.output_hash).toBe(sha256Hex(""));
      expect(r.output_length).toBe(0);
    });

    it("handles empty object output", () => {
      const r = buildWorkProductReceipt({
        product_type: "redline",
        product_ref: "x",
        output: {},
        brain_id: "b",
      });
      expect(r.output_hash).toBe(sha256Hex("{}"));
      expect(r.output_length).toBe(2);
    });

    it("handles deeply nested object output", () => {
      const nested = { a: { b: { c: { d: "deep" } } } };
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: nested,
        brain_id: "b",
      });
      expect(isReceiptValid(r, { a: { b: { c: { d: "deep" } } } })).toBe(true);
      expect(isReceiptValid(r, { a: { b: { c: { d: "shallow" } } } })).toBe(false);
    });

    it("handles null values in object output", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: { a: null, b: 1 },
        brain_id: "b",
      });
      expect(isReceiptValid(r, { a: null, b: 1 })).toBe(true);
    });

    it("handles undefined values by omitting them", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: { a: 1, b: undefined },
        brain_id: "b",
      });
      expect(isReceiptValid(r, { a: 1 })).toBe(true);
    });

    it("handles array of mixed types", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: [1, "two", true, null],
        brain_id: "b",
      });
      expect(isReceiptValid(r, [1, "two", true, null])).toBe(true);
      expect(isReceiptValid(r, [1, "two", false, null])).toBe(false);
    });

    it("verified_at is set for VERIFIED state", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
        checks: [{ name: "c", description: "", passed: true, severity: "info" }],
      });
      expect(r.verified_at).toBeDefined();
    });

    it("verified_at is set for VERIFIED_WITH_WARNINGS state", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
        checks: [{ name: "c", description: "", passed: false, severity: "warning" }],
      });
      expect(r.verified_at).toBeDefined();
    });

    it("verified_at is undefined for NEEDS_HUMAN_REVIEW state", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
        checks: [{ name: "c", description: "", passed: false, severity: "error" }],
      });
      expect(r.verified_at).toBeUndefined();
    });

    it("stores all provided metadata", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: "content",
        brain_id: "b",
        user_id: "user-123",
        jurisdiction: "at",
        models: ["deepseek-v3.2", "grok-4.3"],
        source_snapshot_hashes: ["slug-1", "slug-2"],
        metadata: { custom: "value", nested: { key: 1 } },
      });
      expect(r.user_id).toBe("user-123");
      expect(r.jurisdiction).toBe("at");
      expect(r.models).toEqual(["deepseek-v3.2", "grok-4.3"]);
      expect(r.source_snapshot_hashes).toEqual(["slug-1", "slug-2"]);
      expect(r.metadata.custom).toBe("value");
      expect(r.metadata.nested).toEqual({ key: 1 });
    });

    it("receipt is JSON-serializable", () => {
      const r = buildWorkProductReceipt({
        product_type: "memo",
        product_ref: "x",
        output: { text: "content" },
        brain_id: "b",
        metadata: { key: "value" },
      });
      const json = JSON.stringify(r);
      const parsed = JSON.parse(json) as WorkProductReceipt;
      expect(parsed.receipt_id).toBe(r.receipt_id);
      expect(parsed.output_hash).toBe(r.output_hash);
      expect(parsed.state).toBe(r.state);
    });
  });

  // ── State resolution edge cases ───────────────────────────────────────

  describe("state resolution edge cases", () => {
    it("BLOCKED takes priority over NEEDS_HUMAN_REVIEW", () => {
      expect(
        resolveReceiptState(
          [
            { name: "a", description: "", passed: false, severity: "critical" },
            { name: "b", description: "", passed: false, severity: "error" },
          ],
          []
        )
      ).toBe("BLOCKED");
    });

    it("NEEDS_HUMAN_REVIEW takes priority over VERIFIED_WITH_WARNINGS", () => {
      expect(
        resolveReceiptState(
          [
            { name: "a", description: "", passed: false, severity: "error" },
            { name: "b", description: "", passed: false, severity: "warning" },
          ],
          []
        )
      ).toBe("NEEDS_HUMAN_REVIEW");
    });

    it("risk level high triggers BLOCKED", () => {
      expect(resolveReceiptState([], [], "high")).toBe("BLOCKED");
    });

    it("risk level critical triggers BLOCKED", () => {
      expect(resolveReceiptState([], [], "critical")).toBe("BLOCKED");
    });

    it("GUARDRAIL_FLAGGED flag triggers NEEDS_HUMAN_REVIEW", () => {
      expect(resolveReceiptState([], ["GUARDRAIL_FLAGGED"])).toBe("NEEDS_HUMAN_REVIEW");
    });

    it("warning flag triggers VERIFIED_WITH_WARNINGS with passing checks", () => {
      expect(
        resolveReceiptState(
          [{ name: "c", description: "", passed: true, severity: "info" }],
          ["CROSS_VERIFY_WARNING"]
        )
      ).toBe("VERIFIED_WITH_WARNINGS");
    });
  });
});
