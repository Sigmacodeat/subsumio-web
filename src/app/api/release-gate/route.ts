import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  evaluateReleaseGate,
  loadBaseline,
  loadEvalHistory,
  DEFAULT_THRESHOLDS,
} from "@/lib/release-gate";

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const history = await loadEvalHistory(ENGINE_URL, ctx.headers);
      const baseline = await loadBaseline(ENGINE_URL, ctx.headers);

      if (history.length === 0) {
        return apiSuccess({
          status: "warn" as const,
          checks: [],
          summary: "Keine Eval-Runs vorhanden — Release-Gate kann nicht evaluiert werden.",
          eval_timestamp: new Date().toISOString(),
          thresholds: DEFAULT_THRESHOLDS,
        });
      }

      const latest = history[0];
      const result = evaluateReleaseGate(latest, null, baseline, DEFAULT_THRESHOLDS);

      return apiSuccess(result);
    } catch (err) {
      return apiError(
        "gate_eval_failed",
        err instanceof Error ? err.message : "gate_eval_failed",
        500
      );
    }
  }
);
