/**
 * Work Product Status Transition API
 *
 * POST /api/work-products/[id]/transition
 * Body: { to: "in_review" | "approved" | "rejected" | "published" | "draft",
 *         rejection_reason? }
 *
 * Security: approved_by/rejected_by are set from ctx.user (server-side),
 *           never from client body. Publishing requires receipt + claim-evidence.
 */

import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getWorkProduct, transitionWorkProductStatus } from "@/lib/work-product-store";
import { getReceipt } from "@/lib/work-product-receipt-store";
import { assertTransition, type WorkProductStatus } from "@/lib/work-product";
import { evaluateWorkProductReleaseGate } from "@/lib/work-product-release-policy";
import { can } from "@/lib/permissions";
import { ENGINE_URL } from "@/lib/engine";
import type { ClaimEvidenceGraph } from "../../../../../../server/src/core/legal/claim-evidence.ts";

const transitionSchema = z.object({
  to: z.enum(["draft", "in_review", "approved", "rejected", "published"]),
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
  async (ctx, body, _query, req) => {
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

    if (
      (body.to === "approved" || body.to === "rejected" || body.to === "published") &&
      !can(ctx.user, "workflow.approve")
    ) {
      return apiError("forbidden", "Only lawyers or administrators may decide a review", 403);
    }

    // Security: Use server-side identity for approval/rejection
    const transitionOpts: {
      approvedBy?: string;
      rejectedBy?: string;
      rejectionReason?: string;
    } = {};

    if (body.to === "approved") {
      transitionOpts.approvedBy = ctx.user.id;
    } else if (body.to === "rejected") {
      transitionOpts.rejectedBy = ctx.user.id;
      transitionOpts.rejectionReason = body.rejection_reason;
    }

    // Approval and publication use the same fail-closed evidence gate. A slug
    // or receipt id alone is not proof that the current content was verified.
    if (body.to === "approved" || body.to === "published") {
      const receipt = existing.receipt_id
        ? await getReceipt(existing.receipt_id, ctx.brainId)
        : null;
      let graph: ClaimEvidenceGraph | null = null;
      if (existing.claim_evidence_slug) {
        const encodedSlug = existing.claim_evidence_slug
          .split("/")
          .map(encodeURIComponent)
          .join("/");
        const graphResponse = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (graphResponse.ok) {
          const page = (await graphResponse.json()) as {
            frontmatter?: Record<string, unknown>;
          };
          graph = (page.frontmatter?.claim_evidence_graph as ClaimEvidenceGraph) ?? null;
        } else if (graphResponse.status !== 404) {
          return apiError(
            "claim_evidence_unavailable",
            "Claim-evidence graph could not be verified",
            502
          );
        }
      }

      const gate = evaluateWorkProductReleaseGate(existing, receipt, graph);
      if (!gate.allowed) {
        return apiError(gate.code ?? "not_publishable", gate.message ?? "Release blocked", 409);
      }
    }

    const updated = await transitionWorkProductStatus(
      id,
      ctx.brainId,
      body.to as WorkProductStatus,
      transitionOpts
    );

    if (!updated) {
      return apiError("transition_conflict", "Work product changed concurrently", 409);
    }
    return apiSuccess(updated);
  }
);
