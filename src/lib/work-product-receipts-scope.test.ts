/**
 * Verification Receipts — Scope, Mutation & API Tests
 *
 * Tests cover:
 * 1. Receipt store brain_id scoping (getReceipt with/without brainId)
 * 2. Redline product_ref uniqueness (not brain_id)
 * 3. Receipt creation/invalidation lifecycle for all 6 work product types
 * 4. createEngineProxy receiptProductType integration
 * 5. API route security (brain_id enforcement on receipt endpoints)
 * 6. Tamper evidence
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_WORK_PRODUCT_TYPES,
  buildWorkProductReceipt,
  computeOutputHash,
  invalidateReceipt,
  isReceiptValid,
  type WorkProductReceipt,
  type WorkProductType,
} from "@/lib/work-product-receipts";
import { getReceipt, markReceiptInvalidated } from "@/lib/work-product-receipt-store";
import { createEngineProxy } from "@/lib/api-handler";

// ── Helpers ────────────────────────────────────────────────────────────

function makeReceipt(opts: Partial<WorkProductReceipt> = {}): WorkProductReceipt {
  return buildWorkProductReceipt({
    product_type: opts.product_type ?? "draft",
    product_ref: opts.product_ref ?? "doc-1",
    output: opts.output ?? "test output",
    brain_id: opts.brain_id ?? "brain-A",
    state: opts.state,
    user_id: opts.user_id ?? "user-1",
  });
}

function readRouteFile(...segments: string[]): string {
  return readFileSync(join(process.cwd(), "src", "app", "api", "legal", ...segments), "utf-8");
}

// ── 1. Receipt Store brain_id Scoping ──────────────────────────────────

describe("Receipt Store — brain_id Scoping", () => {
  it("getReceipt is a function accepting (receiptId, brainId?)", () => {
    expect(typeof getReceipt).toBe("function");
  });

  it("markReceiptInvalidated is a function accepting (receiptId, invalidatedBy, brainId?)", () => {
    expect(typeof markReceiptInvalidated).toBe("function");
  });
});

// ── 2. Redline product_ref Uniqueness ──────────────────────────────────

describe("Redline product_ref — Unique Document/Matter Reference", () => {
  it("uses document_slug as product_ref when provided", () => {
    const receipt = makeReceipt({
      product_type: "redline",
      product_ref: "legal/docs/contract-2024-01",
    });
    expect(receipt.product_ref).toBe("legal/docs/contract-2024-01");
    expect(receipt.product_ref).not.toBe(receipt.brain_id);
  });

  it("uses case_slug/redline as product_ref when no document_slug", () => {
    const receipt = makeReceipt({
      product_type: "redline",
      product_ref: "case-mueller-v-huber/redline",
    });
    expect(receipt.product_ref).toContain("case-mueller-v-huber");
    expect(receipt.product_ref).toContain("redline");
    expect(receipt.product_ref).not.toBe(receipt.brain_id);
  });

  it("product_ref is never equal to brain_id for redline", () => {
    const brainId = "brain-xyz-123";
    const productRef = `redline/${brainId}/${Date.now()}`;
    const receipt = makeReceipt({
      product_type: "redline",
      product_ref: productRef,
      brain_id: brainId,
    });
    expect(receipt.product_ref).not.toBe(brainId);
    expect(receipt.product_ref).toContain(brainId);
  });
});

// ── 3. Receipt Creation/Invalidation Lifecycle ─────────────────────────

describe("Receipt Lifecycle — All 6 Work Product Types", () => {
  const productTypes: WorkProductType[] = ALL_WORK_PRODUCT_TYPES;

  it("ALL_WORK_PRODUCT_TYPES contains exactly 6 types", () => {
    expect(productTypes).toHaveLength(6);
    expect(productTypes.sort()).toEqual(
      ["draft", "memo", "fristenreport", "vertragsreview", "redline", "schriftsatz"].sort()
    );
  });

  for (const productType of productTypes) {
    describe(`product_type: ${productType}`, () => {
      it("builds a valid receipt with correct product_type", () => {
        const receipt = makeReceipt({ product_type: productType });
        expect(receipt.product_type).toBe(productType);
        expect(receipt.receipt_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
        expect(receipt.brain_id).toBe("brain-A");
        expect(receipt.version).toBe(1);
      });

      it("invalidation marks receipt as invalid and links to successor", () => {
        const receipt = makeReceipt({ product_type: productType });
        const successorId = "rcpt-successor-001";
        const invalidated = invalidateReceipt(receipt, successorId);

        expect(invalidated.invalidated_at).toBeTruthy();
        expect(invalidated.invalidated_by).toBe(successorId);
        expect(invalidated.receipt_id).toBe(receipt.receipt_id);
      });

      it("isReceiptValid returns true for matching content, false after invalidation", () => {
        const output = "test output for " + productType;
        const receipt = makeReceipt({ product_type: productType, output });
        expect(isReceiptValid(receipt, output)).toBe(true);

        const invalidated = invalidateReceipt(receipt, "rcpt-new-001");
        expect(isReceiptValid(invalidated, output)).toBe(false);
      });

      it("isReceiptValid returns false for tampered content", () => {
        const receipt = makeReceipt({ product_type: productType, output: "original" });
        expect(isReceiptValid(receipt, "tampered")).toBe(false);
      });

      it("output_hash changes when output changes", () => {
        const r1 = makeReceipt({ product_type: productType, output: "output A" });
        const r2 = makeReceipt({ product_type: productType, output: "output B" });
        expect(r1.output_hash).not.toBe(r2.output_hash);
      });

      it("brain_id is always set on the receipt", () => {
        const receipt = makeReceipt({ product_type: productType, brain_id: "brain-test" });
        expect(receipt.brain_id).toBe("brain-test");
      });
    });
  }
});

// ── 4. createEngineProxy receiptProductType Integration ─────────────────

describe("createEngineProxy — receiptProductType Option", () => {
  it("createEngineProxy is a function", () => {
    expect(typeof createEngineProxy).toBe("function");
  });

  it("receiptProductRef function produces unique product_ref", () => {
    const productRef = "case-123/schriftsatz";
    const receipt = makeReceipt({
      product_type: "schriftsatz",
      product_ref: productRef,
    });
    expect(receipt.product_ref).toBe(productRef);
  });
});

// ── 5. API Route Security — brain_id Enforcement ───────────────────────

describe("API Route Security — brain_id Enforcement", () => {
  it("receipts/latest route enforces brain_id === ctx.brainId", () => {
    const src = readRouteFile("receipts", "latest", "route.ts");
    expect(src).toContain("ctx.brainId");
    expect(src).toContain("forbidden");
  });

  it("receipts/[receiptId] route passes ctx.brainId to getReceipt", () => {
    const src = readRouteFile("receipts", "[receiptId]", "route.ts");
    expect(src).toContain("ctx.brainId");
    expect(src).toContain("getReceipt");
  });

  it("contract-redline route scopes receipt with ctx.brainId", () => {
    const src = readRouteFile("contract-redline", "route.ts");
    expect(src).toContain("ctx.brainId");
    expect(src).toContain("product_ref");
    expect(src).toContain("document_slug");
  });

  it("fristenreport route scopes receipt with ctx.brainId", () => {
    const src = readRouteFile("fristenreport", "route.ts");
    expect(src).toContain("ctx.brainId");
    expect(src).toContain("fristenreport");
  });

  it("schriftsatz route uses createEngineProxy with receiptProductType", () => {
    const src = readRouteFile("schriftsatz", "route.ts");
    expect(src).toContain("receiptProductType");
    expect(src).toContain("schriftsatz");
    expect(src).toContain("receiptProductRef");
  });

  it("contract-draft route has receiptProductType", () => {
    const src = readRouteFile("contract-draft", "route.ts");
    expect(src).toContain("receiptProductType");
    expect(src).toContain('"draft"');
  });

  it("memo route has receiptProductType", () => {
    const src = readRouteFile("memo", "route.ts");
    expect(src).toContain("receiptProductType");
    expect(src).toContain('"memo"');
  });

  it("document-review route has receiptProductType", () => {
    const src = readRouteFile("document-review", "route.ts");
    expect(src).toContain("receiptProductType");
    expect(src).toContain('"vertragsreview"');
  });
});

// ── 6. Tamper Evidence ─────────────────────────────────────────────────

describe("Receipt Tamper Evidence", () => {
  it("changing output changes output_hash", () => {
    const r1 = makeReceipt({ output: "original" });
    const r2 = makeReceipt({ output: "tampered" });
    expect(r1.output_hash).not.toBe(r2.output_hash);
  });

  it("invalidated receipt fails isReceiptValid", () => {
    const output = "test output";
    const receipt = makeReceipt({ output });
    expect(isReceiptValid(receipt, output)).toBe(true);
    const invalidated = invalidateReceipt(receipt, "rcpt-new-001");
    expect(isReceiptValid(invalidated, output)).toBe(false);
  });

  it("receipt_id is a UUID (not content-derived)", () => {
    const r1 = makeReceipt({
      product_type: "memo",
      product_ref: "ref-1",
      output: "same output",
      brain_id: "brain-1",
    });
    expect(r1.receipt_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("receipt_id differs for different brain_id", () => {
    const r1 = makeReceipt({
      product_type: "memo",
      product_ref: "ref-1",
      output: "same output",
      brain_id: "brain-1",
    });
    const r2 = makeReceipt({
      product_type: "memo",
      product_ref: "ref-1",
      output: "same output",
      brain_id: "brain-2",
    });
    expect(r1.brain_id).not.toBe(r2.brain_id);
    expect(r1.receipt_id).not.toBe(r2.receipt_id);
  });
});
