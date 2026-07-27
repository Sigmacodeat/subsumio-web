import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { saveQualitySnapshot } from "@/lib/quality-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * POST /api/monitoring/quality-snapshots
 *
 * Persists a new quality snapshot from the current corpus-stats report.
 * Expects the report as JSON body (same shape as GET /api/monitoring/corpus-stats).
 */
export const POST = createHandler(
  {
    action: "admin.*" as never,
    cacheMaxAge: 0,
    skipCsrf: true,
  },
  async (_ctx, _body, _query, req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    try {
      const payload = await req.json();
      const report = payload?.report;
      if (!report || typeof report !== "object") {
        return apiError("bad_request", "Missing or invalid report field", 400);
      }

      const row = await saveQualitySnapshot({
        brain_id: _ctx.brainId,
        report,
        health_score: report.health?.score ?? 0,
        corpus_total_pages: report.corpus?.total_pages ?? 0,
        corpus_total_chunks: report.corpus?.total_chunks ?? 0,
        embedding_coverage_pct: report.corpus?.embedding_coverage_pct ?? 0,
        hallucination_rate: report.hallucination?.hallucination_rate ?? 0,
        guardrail_pass_rate: report.hallucination?.guardrail_pass_rate ?? 0,
        generated_at: report.generated_at ?? new Date().toISOString(),
      });

      return apiSuccess({ snapshot: row });
    } catch (err) {
      console.error("[POST /api/monitoring/quality-snapshots]", err);
      return apiError("internal_error", "Failed to save quality snapshot", 500);
    }
  }
);
