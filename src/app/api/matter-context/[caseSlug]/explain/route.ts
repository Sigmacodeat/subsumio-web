import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { explainRetrieval } from "@/lib/matter-context";
import type { QueryMode } from "@/lib/matter-context-types";

export const maxDuration = 30;

const explainQuerySchema = z.object({
  q: z.string().min(1).max(1000),
  mode: z.enum(["conservative", "balanced", "deep_matter"]).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "search",
    query: explainQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    const mode = (query.mode ?? "balanced") as QueryMode;
    const results = await explainRetrieval(
      query.q,
      ENGINE_URL,
      engineHeadersForBrain(ctx.brainId),
      mode
    );

    return Response.json({
      query: query.q,
      mode,
      results,
      result_count: results.length,
      generated_at: new Date().toISOString(),
    });
  }
);
