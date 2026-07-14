import { describe, expect, test } from "vitest";
import {
  approveWorkProduct,
  assertTransition,
  attachClaimEvidenceGraph,
  attachReceipt,
  canTransition,
  createWorkProduct,
  hashContent,
  isContentCurrent,
  isPublishable,
  publishWorkProduct,
  rejectWorkProduct,
  revertToDraft,
  STATUS_LABELS_DE,
  submitForReview,
  updateContent,
  workProductSummary,
  type WorkProductStatus,
} from "./work-product.ts";

const NOW = "2026-07-14T10:00:00.000Z";

function baseWp() {
  return createWorkProduct({
    product_type: "memo",
    case_slug: "case-1",
    title: "Rechtsgutachten zum Sachmangel",
    content: "Erste Fassung des Gutachtens.",
    brain_id: "brain-1",
    user_id: "user-1",
    jurisdiction: "DE",
  });
}

describe("Work Product Contract", () => {
  test("creates a draft work product with correct defaults", () => {
    const wp = baseWp();
    expect(wp.status).toBe("draft");
    expect(wp.content_hash).toBeTruthy();
    expect(wp.receipt_id).toBeNull();
    expect(wp.claim_evidence_slug).toBeNull();
    expect(wp.created_at).toBe(wp.updated_at);
  });

  test("status machine allows draft → in_review → approved → published", () => {
    expect(canTransition("draft", "in_review")).toBe(true);
    expect(canTransition("in_review", "approved")).toBe(true);
    expect(canTransition("approved", "published")).toBe(true);
  });

  test("status machine allows in_review → rejected → draft", () => {
    expect(canTransition("in_review", "rejected")).toBe(true);
    expect(canTransition("rejected", "draft")).toBe(true);
  });

  test("status machine blocks invalid transitions", () => {
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("published", "in_review")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  test("assertTransition throws on invalid transition", () => {
    expect(() => assertTransition("draft", "published")).toThrow();
  });

  test("submitForReview sets submitted_at and clears rejection", () => {
    const wp = baseWp();
    const submitted = submitForReview(wp, NOW);
    expect(submitted.status).toBe("in_review");
    expect(submitted.submitted_at).toBe(NOW);
    expect(submitted.updated_at).toBe(NOW);
  });

  test("approveWorkProduct sets approved_at and approved_by", () => {
    const wp = submitForReview(baseWp(), NOW);
    const approved = approveWorkProduct(wp, "attorney-1", NOW);
    expect(approved.status).toBe("approved");
    expect(approved.approved_at).toBe(NOW);
    expect(approved.approved_by).toBe("attorney-1");
  });

  test("rejectWorkProduct sets rejection metadata", () => {
    const wp = submitForReview(baseWp(), NOW);
    const rejected = rejectWorkProduct(wp, "partner-1", "Unvollständig", NOW);
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejected_by).toBe("partner-1");
    expect(rejected.rejection_reason).toBe("Unvollständig");
  });

  test("publishWorkProduct sets published_at", () => {
    const wp = approveWorkProduct(submitForReview(baseWp(), NOW), "attorney-1", NOW);
    const published = publishWorkProduct(wp, NOW);
    expect(published.status).toBe("published");
    expect(published.published_at).toBe(NOW);
  });

  test("revertToDraft allows re-editing after rejection", () => {
    const wp = rejectWorkProduct(submitForReview(baseWp(), NOW), "partner-1", "Fix needed", NOW);
    const reverted = revertToDraft(wp, NOW);
    expect(reverted.status).toBe("draft");
  });

  test("updateContent updates hash and timestamp", () => {
    const wp = baseWp();
    const updated = updateContent(wp, "Neue Fassung", NOW);
    expect(updated.content).toBe("Neue Fassung");
    expect(updated.content_hash).toBe(hashContent("Neue Fassung"));
    expect(updated.updated_at).toBe(NOW);
  });

  test("isContentCurrent detects content changes", () => {
    const wp = baseWp();
    expect(isContentCurrent(wp, "Erste Fassung des Gutachtens.")).toBe(true);
    expect(isContentCurrent(wp, "Geänderte Fassung")).toBe(false);
  });

  test("isPublishable only for approved or published", () => {
    expect(isPublishable({ ...baseWp(), status: "approved" })).toBe(true);
    expect(isPublishable({ ...baseWp(), status: "published" })).toBe(true);
    expect(isPublishable(baseWp())).toBe(false);
  });

  test("attachReceipt and attachClaimEvidenceGraph set references", () => {
    let wp = baseWp();
    wp = attachReceipt(wp, "receipt-123");
    wp = attachClaimEvidenceGraph(wp, "claim-evidence/case-1");
    expect(wp.receipt_id).toBe("receipt-123");
    expect(wp.claim_evidence_slug).toBe("claim-evidence/case-1");
  });

  test("workProductSummary returns compact view", () => {
    const wp = attachReceipt(baseWp(), "r-1");
    const summary = workProductSummary(wp);
    expect(summary.statusLabel).toBe("Entwurf");
    expect(summary.hasReceipt).toBe(true);
    expect(summary.hasClaimEvidence).toBe(false);
  });

  test("STATUS_LABELS_DE covers all statuses", () => {
    const statuses: WorkProductStatus[] = [
      "draft",
      "in_review",
      "approved",
      "rejected",
      "published",
    ];
    for (const status of statuses) {
      expect(STATUS_LABELS_DE[status]).toBeTruthy();
    }
  });
});
