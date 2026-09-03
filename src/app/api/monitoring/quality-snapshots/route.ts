import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { saveQualitySnapshot } from "@/lib/quality-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const qualitySnapshotSchema = z.object({
  report: z.record(z.unknown()),
});

/**
 * POST /api/monitoring/quality-snapshots
 *
 * Persists a new quality snapshot from the current corpus-stats report.
 * Expects the report as JSON body (same shape as GET /api/monitoring/corpus-stats).
 */
export const POST = createHandler(
  {
    action: "admin.*",
    cacheMaxAge: 0,
    skipCsrf: true,
    body: qualitySnapshotSchema,
    audit: (_ctx, _body) => ({
      action: "system.integrity_check" as const,
      entityType: "quality_snapshot",
      details: {},
    }),
  },
  async (ctx, body) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    try {
      const report = (body as { report: Record<string, unknown> }).report;

      const row = await saveQualitySnapshot({
        brain_id: ctx.brainId,
        report,
        health_score: (report.health as { score?: number })?.score ?? 0,
        corpus_total_pages: (report.corpus as { total_pages?: number })?.total_pages ?? 0,
        corpus_total_chunks: (report.corpus as { total_chunks?: number })?.total_chunks ?? 0,
        embedding_coverage_pct:
          (report.corpus as { embedding_coverage_pct?: number })?.embedding_coverage_pct ?? 0,
        hallucination_rate:
          (report.hallucination as { hallucination_rate?: number })?.hallucination_rate ?? 0,
        guardrail_pass_rate:
          (report.hallucination as { guardrail_pass_rate?: number })?.guardrail_pass_rate ?? 0,
        generated_at: (report.generated_at as string) ?? new Date().toISOString(),
      });

      return apiSuccess({ snapshot: row });
    } catch (err) {
      console.error("[POST /api/monitoring/quality-snapshots]", err);
      return apiError("internal_error", "Failed to save quality snapshot", 500);
    }
  }
);
