import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { buildMatterContext } from "@/lib/matter-context";
import { runSuperbrainEval, SUPERBRAIN_EVAL_FIXTURES, type MatterContextForEval } from "@/lib/superbrain-eval";

export const maxDuration = 60;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    cacheMaxAge: 0,
  },
  async (ctx, _body, _query, _req) => {
    const headers = engineHeadersForBrain(ctx.brainId);

    const contextFetcher = async (caseSlug: string): Promise<MatterContextForEval | null> => {
      try {
        const bundle = await buildMatterContext(caseSlug, ENGINE_URL, headers);
        return {
          parties: bundle.parties,
          deadlines: bundle.deadlines,
          documents: bundle.documents,
          coverage: {
            completeness_score: bundle.coverage.completeness_score,
            sources: bundle.coverage.sources.map((s) => ({
              source_id: s.source_id,
              source_type: s.source_type,
              connected: s.connected,
            })),
          },
          gaps: bundle.gaps,
          engine_reachable: bundle.engine_reachable,
        };
      } catch {
        return null;
      }
    };

    try {
      const summary = await runSuperbrainEval(contextFetcher, SUPERBRAIN_EVAL_FIXTURES);
      return Response.json(summary);
    } catch (err) {
      console.error("[superbrain-eval] failed:", err instanceof Error ? err.message : String(err));
      return apiError("eval_error", "Superbrain Eval failed", 500);
    }
  },
);
