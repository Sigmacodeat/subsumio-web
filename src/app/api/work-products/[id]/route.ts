/**
 * Work Product Detail API — Get, Update Content, Transition Status
 *
 * GET    /api/work-products/[id]
 * PATCH  /api/work-products/[id]           — update content
 * POST   /api/work-products/[id]/transition — status transition
 */

import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  getWorkProduct,
  updateWorkProductContent,
  attachReceiptToWorkProduct,
  attachClaimEvidenceToWorkProduct,
} from "@/lib/work-product-store";

export const GET = createHandler(
  {
    action: "legal.memo",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const id = new URL(req.url).pathname.split("/").pop()!;
    const wp = await getWorkProduct(id, ctx.brainId);
    if (!wp) return apiError("not_found", "Work product not found", 404);
    return apiSuccess(wp);
  }
);

const patchSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  receipt_id: z.string().optional(),
  claim_evidence_slug: z.string().optional(),
});

export const PATCH = createHandler(
  {
    action: "legal.memo",
    rateTier: "heavy",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "legal.memo",
      entityType: "work_product",
      details: { updated: true },
    }),
  },
  async (ctx, body, _query, req) => {
    const id = new URL(req.url).pathname.split("/").pop()!;
    const existing = await getWorkProduct(id, ctx.brainId);
    if (!existing) return apiError("not_found", "Work product not found", 404);

    if (body.content !== undefined) {
      if (existing.status === "approved" || existing.status === "published") {
        return apiError(
          "content_locked",
          "Revert an approved or published work product to draft before editing",
          409
        );
      }
      const contentUpdated = await updateWorkProductContent(id, ctx.brainId, body.content);
      if (!contentUpdated) {
        return apiError("update_conflict", "Work product changed concurrently", 409);
      }
    }
    if (body.receipt_id !== undefined) {
      await attachReceiptToWorkProduct(id, ctx.brainId, body.receipt_id);
    }
    if (body.claim_evidence_slug !== undefined) {
      await attachClaimEvidenceToWorkProduct(id, ctx.brainId, body.claim_evidence_slug);
    }

    const updated = await getWorkProduct(id, ctx.brainId);
    return apiSuccess(updated);
  }
);
