import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertChunkModelConsistency,
  auditChunkModels,
  auditEmbeddingSignatures,
  formatSignatureWarning,
  modelMatchesSignature,
  resetEmbeddingMismatchWarning,
  type SignatureAuditResult,
} from "./embedding-consistency-guard.ts";

describe("embedding-consistency-guard", () => {
  beforeEach(() => {
    resetEmbeddingMismatchWarning();
  });

  describe("formatSignatureWarning", () => {
    it("returns null when consistent", () => {
      const audit: SignatureAuditResult = {
        currentSignature: "openrouter:openai/text-embedding-3-small:1536",
        distinctSignatures: [
          { signature: "openrouter:openai/text-embedding-3-small:1536", page_count: 100 },
        ],
        totalPagesWithSignature: 100,
        totalPagesNull: 50,
        isConsistent: true,
        mismatchedSignature: null,
      };
      expect(formatSignatureWarning(audit)).toBeNull();
    });

    it("returns null when no pages have signatures (fresh brain)", () => {
      const audit: SignatureAuditResult = {
        currentSignature: "openrouter:openai/text-embedding-3-small:1536",
        distinctSignatures: [],
        totalPagesWithSignature: 0,
        totalPagesNull: 0,
        isConsistent: true,
        mismatchedSignature: null,
      };
      expect(formatSignatureWarning(audit)).toBeNull();
    });

    it("rejects a single non-current signature", () => {
      const audit: SignatureAuditResult = {
        currentSignature: "openrouter:openai/text-embedding-3-small:1536",
        distinctSignatures: [{ signature: "zeroentropyai:zembed-1:1536", page_count: 100 }],
        totalPagesWithSignature: 100,
        totalPagesNull: 0,
        isConsistent: false,
        mismatchedSignature: "zeroentropyai:zembed-1:1536",
      };
      expect(formatSignatureWarning(audit)).toContain("EMBEDDING MODEL MISMATCH");
    });

    it("returns warning string when mismatched", () => {
      const audit: SignatureAuditResult = {
        currentSignature: "openrouter:openai/text-embedding-3-small:1536",
        distinctSignatures: [
          { signature: "openai:text-embedding-3-large:3072", page_count: 500 },
          { signature: "openrouter:openai/text-embedding-3-small:1536", page_count: 10 },
        ],
        totalPagesWithSignature: 510,
        totalPagesNull: 20,
        isConsistent: false,
        mismatchedSignature: "openai:text-embedding-3-large:3072",
      };
      const warning = formatSignatureWarning(audit);
      expect(warning).not.toBeNull();
      expect(warning).toContain("EMBEDDING MODEL MISMATCH");
      expect(warning).toContain("openrouter:openai/text-embedding-3-small:1536");
      expect(warning).toContain("openai:text-embedding-3-large:3072");
      expect(warning).toContain("gbrain embed --stale");
    });

    it("includes all signatures when more than 2 distinct", () => {
      const audit: SignatureAuditResult = {
        currentSignature: "model-c:1280",
        distinctSignatures: [
          { signature: "model-a:1536", page_count: 300 },
          { signature: "model-b:3072", page_count: 200 },
          { signature: "model-c:1280", page_count: 50 },
        ],
        totalPagesWithSignature: 550,
        totalPagesNull: 0,
        isConsistent: false,
        mismatchedSignature: "model-a:1536",
      };
      const warning = formatSignatureWarning(audit);
      expect(warning).not.toBeNull();
      expect(warning).toContain("All signatures in DB");
      expect(warning).toContain("model-a:1536");
      expect(warning).toContain("model-b:3072");
      expect(warning).toContain("model-c:1280");
      expect(warning).toContain("← current");
    });
  });

  describe("signature audit", () => {
    it("rejects a foreign minority even when the current model is dominant", async () => {
      const engine = {
        executeRaw: vi.fn().mockResolvedValue([
          {
            embedding_signature: "openrouter:openai/text-embedding-3-small:1536",
            page_count: "90",
          },
          { embedding_signature: "zeroentropyai:zembed-1:1536", page_count: "10" },
        ]),
      } as any;
      const audit = await auditEmbeddingSignatures(
        engine,
        "openrouter:openai/text-embedding-3-small:1536"
      );
      expect(audit.isConsistent).toBe(false);
      expect(audit.mismatchedSignature).toBe("zeroentropyai:zembed-1:1536");
    });
  });

  describe("chunk model audit", () => {
    it("accepts model names with or without the dimension suffix", () => {
      const signature = "openrouter:openai/text-embedding-3-small:1536";
      expect(modelMatchesSignature(signature, signature)).toBe(true);
      expect(modelMatchesSignature("openrouter:openai/text-embedding-3-small", signature)).toBe(
        true
      );
      expect(modelMatchesSignature("zeroentropyai:zembed-1", signature)).toBe(false);
    });

    it("counts foreign embedded chunks and fails closed", async () => {
      const engine = {
        executeRaw: vi.fn().mockResolvedValue([
          { model: "openrouter:openai/text-embedding-3-small:1536", chunk_count: "80" },
          { model: "zeroentropyai:zembed-1", chunk_count: "20" },
        ]),
      } as any;

      const signature = "openrouter:openai/text-embedding-3-small:1536";
      const audit = await auditChunkModels(engine, signature);
      expect(audit.embeddedChunks).toBe(100);
      expect(audit.mismatchedChunks).toBe(20);
      expect(audit.isConsistent).toBe(false);
      await expect(assertChunkModelConsistency(engine, signature)).rejects.toThrow("20 chunk(s)");
    });
  });
});
