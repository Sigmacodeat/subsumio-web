import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const querySchema = z.object({
  days: z.coerce.number().min(1).max(90).default(7),
});

/**
 * GET /api/monitoring/quality-report — AI Quality Report for dashboard.
 *
 * Returns aggregated hallucination metrics, guardrail stats, and
 * calibration ECE for the last N days.
 *
 * Requires admin role.
 */
export const GET = createHandler(
  {
    action: "admin.*" as never,
    query: querySchema,
    cacheMaxAge: 0,
  },
  async (ctx, _body, query) => {
    const { days } = query as { days: number };
    const pool = getSharedPgPool();

    if (!pool) {
      return apiSuccess({
        hallucination: null,
        guardrail_stats: null,
        calibration: { samples: [], ece: 0, sample_count: 0 },
        trace_count: 0,
      });
    }

    const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();

    try {
      // Hallucination metrics from reasoning traces
      const traceResult = await pool.query(
        `SELECT
          COUNT(*) as total_traces,
          COUNT(*) FILTER (WHERE guardrail_passed = true) as guardrail_passed_count,
          COUNT(*) FILTER (WHERE guardrail_passed IS NOT NULL) as guardrail_known,
          COUNT(*) FILTER (WHERE cross_verify_clean = true) as cross_verify_clean_count,
          COUNT(*) FILTER (WHERE cross_verify_clean IS NOT NULL) as cross_verify_known,
          COUNT(*) FILTER (WHERE guardrail_passed = false OR cross_verify_clean = false) as hallucination_count,
          COUNT(*) FILTER (WHERE regeneration_count > 0) as regeneration_count,
          AVG(overall_confidence) FILTER (WHERE overall_confidence IS NOT NULL) as avg_confidence,
          COUNT(*) FILTER (WHERE overall_confidence IS NOT NULL AND overall_confidence < 0.5) as low_confidence_count,
          COUNT(*) FILTER (WHERE overall_confidence IS NOT NULL) as confidence_known,
          AVG(jsonb_array_length(provenance_links)) FILTER (WHERE provenance_links IS NOT NULL AND jsonb_typeof(provenance_links) = 'array') as avg_provenance_links,
          COUNT(*) FILTER (WHERE provenance_links IS NOT NULL AND jsonb_typeof(provenance_links) = 'array') as provenance_count
         FROM subsumio_reasoning_traces
         WHERE brain_id = $1 AND timestamp >= $2::timestamptz`,
        [ctx.brainId, cutoffDate]
      );

      const row = traceResult.rows[0] ?? {};
      const totalTraces = Number(row.total_traces ?? 0);
      const guardrailKnown = Number(row.guardrail_known ?? 0);
      const crossVerifyKnown = Number(row.cross_verify_known ?? 0);
      const confidenceKnown = Number(row.confidence_known ?? 0);
      const provenanceCount = Number(row.provenance_count ?? 0);

      const hallucination =
        totalTraces > 0
          ? {
              total_traces: totalTraces,
              guardrail_pass_rate:
                guardrailKnown > 0
                  ? Math.round((Number(row.guardrail_passed_count ?? 0) / guardrailKnown) * 1000) /
                    10
                  : null,
              cross_verify_clean_rate:
                crossVerifyKnown > 0
                  ? Math.round(
                      (Number(row.cross_verify_clean_count ?? 0) / crossVerifyKnown) * 1000
                    ) / 10
                  : null,
              hallucination_rate:
                guardrailKnown + crossVerifyKnown > 0
                  ? Math.round(
                      (Number(row.hallucination_count ?? 0) / (guardrailKnown + crossVerifyKnown)) *
                        1000
                    ) / 10
                  : null,
              regeneration_rate:
                totalTraces > 0
                  ? Math.round((Number(row.regeneration_count ?? 0) / totalTraces) * 1000) / 10
                  : null,
              avg_confidence:
                row.avg_confidence !== null && row.avg_confidence !== undefined
                  ? Math.round(Number(row.avg_confidence) * 100) / 100
                  : null,
              low_confidence_rate:
                confidenceKnown > 0
                  ? Math.round((Number(row.low_confidence_count ?? 0) / confidenceKnown) * 1000) /
                    10
                  : null,
              avg_provenance_links:
                row.avg_provenance_links !== null && row.avg_provenance_links !== undefined
                  ? Math.round(Number(row.avg_provenance_links) * 10) / 10
                  : null,
              provenance_coverage:
                totalTraces > 0 ? Math.round((provenanceCount / totalTraces) * 1000) / 10 : null,
            }
          : null;

      // Guardrail metrics from guardrail_metrics table
      const guardrailResult = await pool.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE tier_0_passed = true) as tier_0_pass,
          COUNT(*) FILTER (WHERE tier_0_passed = false) as tier_0_fail,
          COUNT(*) FILTER (WHERE tier_0_regenerated = true) as tier_0_regen,
          COUNT(*) FILTER (WHERE tier_1_passed = true) as tier_1_pass,
          COUNT(*) FILTER (WHERE tier_1_passed = false) as tier_1_fail,
          COUNT(*) FILTER (WHERE tier_1_regenerated = true) as tier_1_regen,
          AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) as avg_latency
         FROM subsumio_guardrail_metrics
         WHERE brain_id = $1 AND created_at >= $2::timestamptz`,
        [ctx.brainId, cutoffDate]
      );

      const grRow = guardrailResult.rows[0] ?? {};
      const guardrailStats = {
        total: Number(grRow.total ?? 0),
        tier_0_pass_rate:
          Number(grRow.total ?? 0) > 0
            ? Math.round((Number(grRow.tier_0_pass ?? 0) / Number(grRow.total)) * 1000) / 10
            : null,
        tier_0_fail_count: Number(grRow.tier_0_fail ?? 0),
        tier_0_regen_count: Number(grRow.tier_0_regen ?? 0),
        tier_1_pass_rate:
          Number(grRow.total ?? 0) > 0
            ? Math.round((Number(grRow.tier_1_pass ?? 0) / Number(grRow.total)) * 1000) / 10
            : null,
        tier_1_fail_count: Number(grRow.tier_1_fail ?? 0),
        tier_1_regen_count: Number(grRow.tier_1_regen ?? 0),
        avg_latency_ms:
          grRow.avg_latency !== null && grRow.avg_latency !== undefined
            ? Math.round(Number(grRow.avg_latency))
            : null,
      };

      // Calibration ECE
      const calibResult = await pool.query(
        `SELECT predicted_confidence, actual_correctness
         FROM subsumio_calibration_samples
         WHERE brain_id = $1
         ORDER BY created_at DESC
         LIMIT 500`,
        [ctx.brainId]
      );

      const samples = calibResult.rows.map((r) => ({
        predicted_confidence: Number(r.predicted_confidence),
        actual_correctness: Number(r.actual_correctness),
      }));

      let ece = 0;
      if (samples.length > 0) {
        const numBins = 10;
        const binSize = 1 / numBins;
        for (let i = 0; i < numBins; i++) {
          const lower = i * binSize;
          const upper = (i + 1) * binSize;
          const binSamples = samples.filter(
            (s) =>
              s.predicted_confidence >= lower &&
              (i === numBins - 1 ? s.predicted_confidence <= upper : s.predicted_confidence < upper)
          );
          if (binSamples.length === 0) continue;
          const avgConf =
            binSamples.reduce((sum, s) => sum + s.predicted_confidence, 0) / binSamples.length;
          const avgAcc =
            binSamples.reduce((sum, s) => sum + s.actual_correctness, 0) / binSamples.length;
          ece += (binSamples.length / samples.length) * Math.abs(avgConf - avgAcc);
        }
      }

      return apiSuccess({
        hallucination,
        guardrail_stats: guardrailStats,
        calibration: {
          samples: samples.slice(-50),
          ece: Math.round(ece * 1000) / 1000,
          sample_count: samples.length,
        },
        trace_count: totalTraces,
        days,
      });
    } catch (err) {
      console.error(
        "[quality-report] Failed to generate:",
        err instanceof Error ? err.message : String(err)
      );
      return apiSuccess({
        hallucination: null,
        guardrail_stats: null,
        calibration: { samples: [], ece: 0, sample_count: 0 },
        trace_count: 0,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
);
