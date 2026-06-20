import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { buildMatterContext, buildUnderstandingPanel } from "@/lib/matter-context";

export const maxDuration = 30;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, req) => {
    const { caseSlug } = await ((req as unknown as { params: Promise<{ caseSlug: string }> }).params);
    if (!caseSlug) {
      return Response.json(
        { error: "missing_slug", message: "Case slug is required." },
        { status: 400 },
      );
    }

    const bundle = await buildMatterContext(
      caseSlug,
      ENGINE_URL,
      engineHeadersForBrain(ctx.brainId),
    );

    const panel = buildUnderstandingPanel(bundle);

    return Response.json(panel);
  },
);
