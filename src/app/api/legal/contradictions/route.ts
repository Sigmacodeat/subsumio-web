import { z } from "zod";
import { engineHeadersForBrain } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { checkCaseContradictions } from "@/lib/legal/contradiction-check";

export const maxDuration = 120;

const contradictionsSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  brain_id: z.string().min(1).max(200).optional(),
});

export const POST = createHandler(
  {
    action: "legal.contradictions",
    rateTier: "heavy",
    body: contradictionsSchema,
    allowInternal: true,
    audit: (_ctx, body) => ({
      action: "legal.contradictions" as const,
      entityType: "contradiction_check",
      details: { case_slug: body.case_slug },
    }),
  },
  async (ctx, body, _query, _req) => {
    const isInternal = ctx.brainId === "internal";
    const engineHeaders =
      isInternal && body.brain_id ? engineHeadersForBrain(body.brain_id) : ctx.headers;
    try {
      return Response.json(await checkCaseContradictions(engineHeaders, body.case_slug));
    } catch (err) {
      return apiError(
        "engine_unreachable",
        err instanceof Error ? err.message : "Engine nicht erreichbar",
        503
      );
    }
  }
);
