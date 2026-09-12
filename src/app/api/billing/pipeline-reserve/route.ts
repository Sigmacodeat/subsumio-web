/**
 * Engine-only pipeline reservation.
 *
 * The engine has the extracted document size; the web app owns the credit
 * ledger. This endpoint keeps that boundary explicit and fail-closed.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createWebhookHandler } from "@/lib/api-handler";
import { estimatePipelineCredits } from "@/lib/billing/credit-rate-card";
import { insufficientCreditsResponse, reserveCredits, type OwnerType } from "@/lib/billing/credits";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { clientIp } from "@/lib/auth/rate-limit";

const bodySchema = z.object({
  owner_id: z.string().min(1),
  owner_type: z.enum(["user", "org"]),
  case_slug: z.string().min(1),
  pages: z.number().int().min(1).max(100_000),
  workflow_id: z.enum([
    "quick_answer",
    "aktencheck",
    "memo",
    "fristen_report",
    "schriftsatz",
    "full_pipeline",
  ]),
});

function tierFor(workflowId: z.infer<typeof bodySchema>["workflow_id"]): 1 | 2 | 3 {
  if (workflowId === "quick_answer") return 1;
  if (workflowId === "full_pipeline") return 3;
  return 2;
}

export const POST = createWebhookHandler(
  {
    body: bodySchema,
    rateLimitKey: (req) => `engine:pipeline-reserve:${clientIp(req.headers)}`,
    rateLimitMax: 1_000,
    rateLimitWindowMs: 60_000,
    audit: (body) => ({
      action: "billing.credit_consumption" as const,
      entityType: "billing",
      details: {
        caseSlug: body.case_slug,
        ownerType: body.owner_type,
        workflowId: body.workflow_id,
      },
    }),
  },
  async (body, req) => {
    const expectedKey = process.env.ENGINE_WEBHOOK_API_KEY;
    const providedKey = req.headers.get("x-engine-webhook-key") ?? "";
    if (!expectedKey || !providedKey || !timingSafeCompare(providedKey, expectedKey)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const estimate = estimatePipelineCredits(body.pages, tierFor(body.workflow_id));
    const pipelineKey = `pipeline-${randomUUID()}`;
    const reservation = await reserveCredits(
      body.owner_id,
      body.owner_type as OwnerType,
      estimate.estimatedCredits,
      pipelineKey
    );
    if (!reservation.ok) {
      return insufficientCreditsResponse(
        reservation.balanceAfterReservation,
        estimate.estimatedCredits
      );
    }

    return Response.json({
      ok: true,
      pipeline_key: pipelineKey,
      reserved_credits: reservation.reservedCredits,
      estimated_pages: body.pages,
      workflow_id: body.workflow_id,
    });
  }
);
