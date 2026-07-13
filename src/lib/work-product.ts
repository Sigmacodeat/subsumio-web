/**
 * Unified Work Product Contract — Epic 6.2.1
 *
 * Single source of truth for all legal work products (memo, draft,
 * fristenreport, vertragsreview, redline, schriftsatz).
 *
 * Status machine:
 *   draft → in_review → approved → published
 *                    ↘ rejected → draft
 *
 * The status machine is deterministic: transitions are validated
 * against an allowed-transitions map. The receipt and claim-evidence
 * graph are linked but managed by their respective subsystems.
 */

import { createHash, randomUUID } from "crypto";
import type { WorkProductType } from "./work-product-receipts.ts";

// ── Types ─────────────────────────────────────────────────────────────

export type WorkProductStatus = "draft" | "in_review" | "approved" | "rejected" | "published";

export interface WorkProduct {
  id: string;
  product_type: WorkProductType;
  case_slug: string;
  title: string;
  status: WorkProductStatus;
  content: string | null;
  content_hash: string | null;

  receipt_id: string | null;
  claim_evidence_slug: string | null;

  brain_id: string;
  user_id: string | null;
  jurisdiction: string | null;

  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;

  metadata: Record<string, unknown>;
}

// ── Status Machine ────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<WorkProductStatus, Set<WorkProductStatus>> = {
  draft: new Set(["in_review"]),
  in_review: new Set(["approved", "rejected", "draft"]),
  approved: new Set(["published", "draft"]),
  rejected: new Set(["draft"]),
  published: new Set(["draft"]),
};

export function canTransition(from: WorkProductStatus, to: WorkProductStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

export function assertTransition(from: WorkProductStatus, to: WorkProductStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid work product status transition: ${from} → ${to}. ` +
        `Allowed: ${[...(ALLOWED_TRANSITIONS[from] ?? [])].join(", ")}`
    );
  }
}

export const STATUS_LABELS_DE: Record<WorkProductStatus, string> = {
  draft: "Entwurf",
  in_review: "In Prüfung",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  published: "Veröffentlicht",
};

// ── Factory ───────────────────────────────────────────────────────────

export interface CreateWorkProductOpts {
  product_type: WorkProductType;
  case_slug: string;
  title: string;
  content?: string;
  brain_id: string;
  user_id?: string;
  jurisdiction?: string;
  claim_evidence_slug?: string;
  metadata?: Record<string, unknown>;
}

export function createWorkProduct(opts: CreateWorkProductOpts): WorkProduct {
  const now = new Date().toISOString();
  const content = opts.content ?? null;
  return {
    id: randomUUID(),
    product_type: opts.product_type,
    case_slug: opts.case_slug,
    title: opts.title,
    status: "draft",
    content,
    content_hash: content ? hashContent(content) : null,
    receipt_id: null,
    claim_evidence_slug: opts.claim_evidence_slug ?? null,
    brain_id: opts.brain_id,
    user_id: opts.user_id ?? null,
    jurisdiction: opts.jurisdiction ?? null,
    created_at: now,
    updated_at: now,
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    published_at: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    metadata: opts.metadata ?? {},
  };
}

// ── Transition Functions (pure, return new object) ────────────────────

export function submitForReview(wp: WorkProduct, now?: string): WorkProduct {
  assertTransition(wp.status, "in_review");
  const ts = now ?? new Date().toISOString();
  return {
    ...wp,
    status: "in_review",
    submitted_at: ts,
    updated_at: ts,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
  };
}

export function approveWorkProduct(wp: WorkProduct, approvedBy: string, now?: string): WorkProduct {
  assertTransition(wp.status, "approved");
  const ts = now ?? new Date().toISOString();
  return {
    ...wp,
    status: "approved",
    approved_at: ts,
    approved_by: approvedBy,
    updated_at: ts,
  };
}

export function rejectWorkProduct(
  wp: WorkProduct,
  rejectedBy: string,
  reason?: string,
  now?: string
): WorkProduct {
  assertTransition(wp.status, "rejected");
  const ts = now ?? new Date().toISOString();
  return {
    ...wp,
    status: "rejected",
    rejected_at: ts,
    rejected_by: rejectedBy,
    rejection_reason: reason ?? null,
    updated_at: ts,
  };
}

export function publishWorkProduct(wp: WorkProduct, now?: string): WorkProduct {
  assertTransition(wp.status, "published");
  const ts = now ?? new Date().toISOString();
  return {
    ...wp,
    status: "published",
    published_at: ts,
    updated_at: ts,
  };
}

export function revertToDraft(wp: WorkProduct, now?: string): WorkProduct {
  assertTransition(wp.status, "draft");
  const ts = now ?? new Date().toISOString();
  return {
    ...wp,
    status: "draft",
    updated_at: ts,
  };
}

export function updateContent(wp: WorkProduct, content: string, now?: string): WorkProduct {
  const ts = now ?? new Date().toISOString();
  return {
    ...wp,
    content,
    content_hash: hashContent(content),
    updated_at: ts,
  };
}

export function attachReceipt(wp: WorkProduct, receiptId: string): WorkProduct {
  return {
    ...wp,
    receipt_id: receiptId,
  };
}

export function attachClaimEvidenceGraph(wp: WorkProduct, slug: string): WorkProduct {
  return {
    ...wp,
    claim_evidence_slug: slug,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function isContentCurrent(wp: WorkProduct, content: string): boolean {
  return wp.content_hash === hashContent(content);
}

export function isPublishable(wp: WorkProduct): boolean {
  return wp.status === "approved" || wp.status === "published";
}

export function workProductSummary(wp: WorkProduct): {
  id: string;
  type: WorkProductType;
  title: string;
  status: WorkProductStatus;
  statusLabel: string;
  hasReceipt: boolean;
  hasClaimEvidence: boolean;
  contentHash: string | null;
} {
  return {
    id: wp.id,
    type: wp.product_type,
    title: wp.title,
    status: wp.status,
    statusLabel: STATUS_LABELS_DE[wp.status],
    hasReceipt: wp.receipt_id !== null,
    hasClaimEvidence: wp.claim_evidence_slug !== null,
    contentHash: wp.content_hash,
  };
}
