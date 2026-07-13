/**
 * Work Product Status Transition API
 *
 * POST /api/work-products/[id]/transition
 * Body: { to: "in_review" | "approved" | "rejected" | "published" | "draft",
 *         approved_by?, rejected_by?, rejection_reason? }
 */

import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getWorkProduct, transitionWorkProductStatus } from "@/lib/work-product-store";
import { assertTransition, type WorkProductStatus } from "@/lib/work-product";

const transitionSchema = z.object({
  to: z.enum(["draft", "in_review", "approved", "rejected", "published"]),
  approved_by: z.string().optional(),
  rejected_by: z.string().optional(),
  rejection_reason: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "legal.memo",
    rateTier: "standard",
    body: transitionSchema,
    audit: (_ctx, body) => ({
      action: "legal.memo",
      entityType: "work_product",
      details: { transition: body.to },
    }),
  },
  async (ctx, body, req) => {
    const id = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    const existing = await getWorkProduct(id, ctx.brainId);
    if (!existing) return apiError("not_found", "Work product not found", 404);

    // Validate transition before attempting
    try {
      assertTransition(existing.status, body.to as WorkProductStatus);
    } catch {
      return apiError(
        "invalid_transition",
        `Cannot transition from ${existing.status} to ${body.to}`,
        400
      );
    }

    const updated = await transitionWorkProductStatus(
      id,
      ctx.brainId,
      body.to as WorkProductStatus,
      {
        approvedBy: body.approved_by,
        rejectedBy: body.rejected_by,
        rejectionReason: body.rejection_reason,
      }
    );

    return apiSuccess(updated);
  }
);
