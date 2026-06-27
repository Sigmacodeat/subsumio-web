import { ENGINE_URL } from "@/lib/engine";
import { runEval } from "@/lib/rag-eval";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  appendEvalHistory,
  loadEvalHistory,
  loadBaseline,
  saveBaseline,
  evaluateReleaseGate,
} from "@/lib/release-gate";

export const maxDuration = 120;

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const summary = await runEval(async (query) => {
        try {
          const res = await fetch(
            `${ENGINE_URL}/api/search?q=${encodeURIComponent(query)}&limit=10`,
            {
              headers: ctx.headers,
            }
          );
          if (!res.ok) return [];
          const data = (await res.json()) as { results?: Array<{ slug: string }> };
          return (data.results || []).map((r) => r.slug);
        } catch {
          return [];
        }
      });

      // Load baseline for regression check
      const baseline = await loadBaseline(ENGINE_URL, ctx.headers);

      // Run release gate evaluation
      const gateResult = evaluateReleaseGate(summary, null, baseline);

      // Persist to history
      await appendEvalHistory(ENGINE_URL, ctx.headers, summary);

      return apiSuccess({ ...summary, gate: gateResult });
    } catch (err) {
      console.error("[rag-eval] run failed:", err instanceof Error ? err.message : String(err));
      return apiError("eval_failed", "Eval-Ausführung fehlgeschlagen", 500);
    }
  }
);

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const history = await loadEvalHistory(ENGINE_URL, ctx.headers);
      const baseline = await loadBaseline(ENGINE_URL, ctx.headers);

      return apiSuccess({
        history,
        baseline,
        totalRuns: history.length,
      });
    } catch (err) {
      console.error("[rag-eval] history failed:", err instanceof Error ? err.message : String(err));
      return apiError("eval_history_failed", "Eval-Historie konnte nicht geladen werden", 500);
    }
  }
);

export const PUT = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const history = await loadEvalHistory(ENGINE_URL, ctx.headers);
      if (history.length === 0) {
        return apiError(
          "no_eval_runs",
          "Keine Eval-Runs vorhanden — führen Sie zuerst einen Eval durch.",
          400
        );
      }

      // Set the latest run as baseline
      const latest = history[0];
      await saveBaseline(ENGINE_URL, ctx.headers, latest);

      return apiSuccess({ baseline: latest, message: "Baseline aktualisiert." });
    } catch (err) {
      console.error(
        "[rag-eval] baseline failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("baseline_save_failed", "Baseline konnte nicht gespeichert werden", 500);
    }
  }
);
