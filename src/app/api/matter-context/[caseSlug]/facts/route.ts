import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { buildMatterContext } from "@/lib/matter-context";

export const maxDuration = 30;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, req) => {
    const { caseSlug } = await (req as unknown as { params: Promise<{ caseSlug: string }> }).params;
    if (!caseSlug) {
      return Response.json(
        { error: "missing_slug", message: "Case slug is required." },
        { status: 400 }
      );
    }

    const bundle = await buildMatterContext(
      caseSlug,
      ENGINE_URL,
      engineHeadersForBrain(ctx.brainId),
      ctx.user.id
    );

    return Response.json({
      case_slug: bundle.case_slug,
      facts: bundle.facts,
      fact_count: bundle.facts.length,
      high_confidence: bundle.facts.filter((f) => f.confidence === "high").length,
      contradictions: bundle.gaps.filter((g) => g.type === "contradictory_facts"),
      generated_at: bundle.generated_at,
    });
  }
);
