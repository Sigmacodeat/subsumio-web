import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { buildBrainQualitySummary } from "@/lib/matter-context";

export const maxDuration = 30;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    const summary = await buildBrainQualitySummary(ENGINE_URL, engineHeadersForBrain(ctx.brainId));
    return Response.json(summary);
  }
);
