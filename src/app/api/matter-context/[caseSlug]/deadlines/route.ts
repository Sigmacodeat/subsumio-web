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

    return Response.json({
      case_slug: bundle.case_slug,
      deadlines: bundle.deadlines,
      deadline_count: bundle.deadlines.length,
      overdue_count: bundle.deadlines.filter((d) => d.urgency === "overdue").length,
      critical_count: bundle.deadlines.filter((d) => d.urgency === "critical").length,
      upcoming_count: bundle.deadlines.filter((d) => d.urgency === "upcoming").length,
      generated_at: bundle.generated_at,
    });
  },
);
