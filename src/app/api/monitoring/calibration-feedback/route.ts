import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const feedbackSchema = z.object({
  trace_id: z.string().min(1),
  predicted_confidence: z.number().min(0).max(1),
  actual_correctness: z.number().min(0).max(1),
  jurisdiction: z.string().optional(),
  model_used: z.string().optional(),
  comment: z.string().max(2000).optional(),
});

export const POST = createHandler(
  {
    action: "legal.retrieval_feedback",
    body: feedbackSchema,
    audit: (ctx, body) => ({
      action: "legal.retrieval_feedback" as const,
      entityType: "trace",
      entityId: body.trace_id,
      details: {
        predicted: body.predicted_confidence,
        actual: body.actual_correctness,
      },
    }),
  },
  async (ctx, body) => {
    const { trace_id, predicted_confidence, actual_correctness, jurisdiction, model_used } = body;

    const pool = getSharedPgPool();
    if (!pool) {
      return apiSuccess({ stored: false, reason: "no-db" });
    }

    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS subsumio_calibration_samples (
          id bigserial PRIMARY KEY,
          brain_id text NOT NULL,
          trace_id text,
          predicted_confidence real NOT NULL,
          actual_correctness real NOT NULL,
          jurisdiction text,
          model_used text,
          created_at timestamptz NOT NULL DEFAULT now()
        )`
      );

      await pool.query(
        `INSERT INTO subsumio_calibration_samples
          (brain_id, trace_id, predicted_confidence, actual_correctness, jurisdiction, model_used)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ctx.brainId,
          trace_id,
          predicted_confidence,
          actual_correctness,
          jurisdiction ?? null,
          model_used ?? null,
        ]
      );

      return apiSuccess({ stored: true });
    } catch (err) {
      return apiSuccess({
        stored: false,
        reason: err instanceof Error ? err.message : "unknown-error",
      });
    }
  }
);

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
});

export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
    cacheMaxAge: 0,
  },
  async (ctx, _body, query) => {
    const { limit } = query as { limit: number };

    const pool = getSharedPgPool();
    if (!pool) {
      return apiSuccess({ samples: [], ece: 0, sample_count: 0 });
    }

    try {
      const result = await pool.query<{
        predicted_confidence: number;
        actual_correctness: number;
      }>(
        `SELECT predicted_confidence, actual_correctness
         FROM subsumio_calibration_samples
         WHERE brain_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [ctx.brainId, limit]
      );

      const samples = result.rows.map((r) => ({
        predicted_confidence: r.predicted_confidence,
        actual_correctness: r.actual_correctness,
      }));

      // Compute ECE
      const numBins = 10;
      const binSize = 1 / numBins;
      let ece = 0;
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

      return apiSuccess({
        samples,
        ece: Math.round(ece * 1000) / 1000,
        sample_count: samples.length,
      });
    } catch {
      return apiSuccess({ samples: [], ece: 0, sample_count: 0 });
    }
  }
);
