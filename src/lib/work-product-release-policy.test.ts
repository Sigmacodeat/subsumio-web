import { describe, expect, it } from "vitest";
import type { ClaimEvidenceGraph } from "../../server/src/core/legal/claim-evidence.ts";
import type { WorkProduct } from "@/lib/work-product";
import type { WorkProductReceipt } from "@/lib/work-product-receipts";
import { evaluateWorkProductReleaseGate } from "@/lib/work-product-release-policy";

const HASH = "a".repeat(64);

function product(overrides: Partial<WorkProduct> = {}): WorkProduct {
  return {
    id: "wp-1",
    product_type: "memo",
    case_slug: "cases/1",
    title: "Memo",
    status: "in_review",
    content: "verified content",
    content_hash: HASH,
    receipt_id: "receipt-1",
    claim_evidence_slug: "claim-evidence/wp-1",
    brain_id: "brain-1",
    user_id: "user-1",
    jurisdiction: "at",
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    published_at: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    metadata: {},
    ...overrides,
  };
}

function receipt(overrides: Partial<WorkProductReceipt> = {}): WorkProductReceipt {
  return {
    receipt_id: "receipt-1",
    product_type: "memo",
    product_ref: "wp-1",
    version: 1,
    state: "VERIFIED",
    checks: [],
    flags: [],
    approvals: [],
    models: [],
    prompt_hashes: [],
    source_snapshot_hashes: [HASH],
    output_hash: HASH,
    output_length: 16,
    created_at: "2026-07-13T00:00:00.000Z",
    brain_id: "brain-1",
    metadata: {},
    ...overrides,
  };
}

function graph(overrides: Partial<ClaimEvidenceGraph> = {}): ClaimEvidenceGraph {
  return {
    schema_version: "1.0",
    graph_id: "graph-1",
    output_id: "wp-1",
    output_type: "memo",
    jurisdiction: "AT",
    as_of_date: "2026-07-13",
    brain_id: "brain-1",
    claims: [
      {
        id: "claim-1",
        kind: "claim",
        claim_kind: "legal",
        text: "A supported legal claim",
        risk: "high",
        jurisdiction: "AT",
        requires_verified_support: true,
      },
    ],
    evidence: [
      {
        id: "evidence-1",
        kind: "rule",
        text: "Verified legal rule",
        source_slug: "law/at/abgb",
        jurisdiction: "AT",
        verification: "verified",
        snapshot_hash: HASH,
      },
    ],
    edges: [
      {
        id: "edge-1",
        from_id: "claim-1",
        to_id: "evidence-1",
        relation: "supports",
        verified: true,
      },
    ],
    created_at: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("work-product release policy", () => {
  it("allows an exact, verified and publishable evidence chain", () => {
    expect(evaluateWorkProductReleaseGate(product(), receipt(), graph())).toEqual({
      allowed: true,
    });
  });

  it("rejects a receipt for different content", () => {
    expect(
      evaluateWorkProductReleaseGate(product(), receipt({ output_hash: "b".repeat(64) }), graph())
        .code
    ).toBe("stale_receipt");
  });

  it("rejects a graph that belongs to another output", () => {
    expect(
      evaluateWorkProductReleaseGate(product(), receipt(), graph({ output_id: "another-output" }))
        .code
    ).toBe("graph_output_mismatch");
  });

  it("rejects unsupported high-risk claims", () => {
    expect(evaluateWorkProductReleaseGate(product(), receipt(), graph({ edges: [] })).code).toBe(
      "claim_evidence_not_publishable"
    );
  });

  it("rejects receipts that still require human review", () => {
    expect(
      evaluateWorkProductReleaseGate(product(), receipt({ state: "NEEDS_HUMAN_REVIEW" }), graph())
        .code
    ).toBe("receipt_not_verified");
  });
});
