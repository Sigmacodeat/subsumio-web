import type { ClaimEvidenceGraph } from "../../server/src/core/legal/claim-evidence.ts";
import {
  computeClaimEvidenceCoverage,
  validateClaimEvidenceGraph,
} from "../../server/src/core/legal/claim-evidence.ts";
import type { WorkProduct } from "@/lib/work-product";
import type { WorkProductReceipt } from "@/lib/work-product-receipts";

export interface WorkProductReleaseGateResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

function blocked(code: string, message: string): WorkProductReleaseGateResult {
  return { allowed: false, code, message };
}

/**
 * Fail-closed release gate shared by approval and publication.
 * References alone are insufficient: the receipt must describe this exact
 * content and the graph must cover this exact work product.
 */
export function evaluateWorkProductReleaseGate(
  product: WorkProduct,
  receipt: WorkProductReceipt | null,
  graph: ClaimEvidenceGraph | null
): WorkProductReleaseGateResult {
  if (!product.content || !product.content_hash) {
    return blocked("missing_content", "Work product has no content to release");
  }
  if (!product.receipt_id || !receipt) {
    return blocked("missing_receipt", "A stored verification receipt is required");
  }
  if (
    receipt.receipt_id !== product.receipt_id ||
    receipt.product_ref !== product.id ||
    receipt.product_type !== product.product_type ||
    receipt.brain_id !== product.brain_id
  ) {
    return blocked("receipt_scope_mismatch", "Receipt does not belong to this work product");
  }
  if (receipt.invalidated_at || receipt.output_hash !== product.content_hash) {
    return blocked("stale_receipt", "Receipt does not match the current content");
  }
  if (receipt.state !== "VERIFIED" && receipt.state !== "VERIFIED_WITH_WARNINGS") {
    return blocked("receipt_not_verified", `Receipt state ${receipt.state} blocks release`);
  }

  if (!product.claim_evidence_slug || !graph) {
    return blocked("missing_claim_evidence", "A stored claim-evidence graph is required");
  }
  if (graph.brain_id && graph.brain_id !== product.brain_id) {
    return blocked("graph_scope_mismatch", "Claim-evidence graph belongs to another brain");
  }
  if (graph.output_id !== product.id) {
    return blocked(
      "graph_output_mismatch",
      "Claim-evidence graph does not cover this work product version"
    );
  }
  if (
    product.jurisdiction &&
    graph.jurisdiction.toLowerCase() !== product.jurisdiction.toLowerCase()
  ) {
    return blocked("graph_jurisdiction_mismatch", "Claim-evidence jurisdiction does not match");
  }

  const validation = validateClaimEvidenceGraph(graph);
  if (!validation.valid) {
    return blocked("invalid_claim_evidence", validation.errors.join("; "));
  }
  const coverage = computeClaimEvidenceCoverage(graph);
  if (!coverage.publishable) {
    return blocked(
      "claim_evidence_not_publishable",
      `Claim-evidence coverage blocks release: ${coverage.unsupported_claims} unsupported, ${coverage.disputed_claims} disputed, ${coverage.stale_claims} stale`
    );
  }

  return { allowed: true };
}
