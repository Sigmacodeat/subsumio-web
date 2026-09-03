import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { buildMatterContext } from "@/lib/matter-context";
import { shouldSuggestInvestigation } from "@/lib/case-investigation-suggest";

export const maxDuration = 30;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, req) => {
    const { caseSlug } = await (
      req as unknown as {
        params: Promise<{ caseSlug: string }>;
      }
    ).params;
    if (!caseSlug) {
      return apiError("missing_slug", "Case slug is required.", 400);
    }

    try {
      const bundle = await buildMatterContext(
        caseSlug,
        ENGINE_URL,
        engineHeadersForBrain(ctx.brainId),
        ctx.user.id
      );
      const suggestion = shouldSuggestInvestigation(bundle);
      return apiSuccess(suggestion);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      return apiError("matter_context_failed", message, 502);
    }
  }
);
