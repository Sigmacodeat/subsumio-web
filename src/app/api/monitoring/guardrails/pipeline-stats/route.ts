import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  hours: z.coerce.number().min(1).max(168).default(24),
});

/**
 * GET /api/monitoring/guardrails/pipeline-stats — Pipeline guardrail metrics.
 *
 * Aggregates guardrail_results and cross_verify_results from pipeline states
 * for the admin dashboard. Shows per-layer pass rates and cross-verify stats.
 *
 * Requires admin role.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
    cacheMaxAge: 0,
  },
  async (ctx, _body, query) => {
    const hours = (query as { hours: number }).hours;
    const pool = getSharedPgPool();
    if (!pool) {
      return apiSuccess({ total_pipelines: 0, by_layer: [], cross_verify: { total: 0, clean: 0, flagged: 0, clean_rate: 0, total_flags: 0 } });
    }

    // Fetch pipeline states with guardrail data from the last N hours
    let result;
    try {
      result = await pool.query(
        `SELECT frontmatter, content, created_at
         FROM pages
         WHERE slug LIKE 'pipeline-state/%'
           AND created_at >= now() - interval '${hours} hours'
         ORDER BY created_at DESC
         LIMIT 200`,
      );
    } catch (err) {
      console.error("[pipeline-stats] query failed:", (err as Error).message);
      return apiSuccess({ total_pipelines: 0, by_layer: [], cross_verify: { total: 0, clean: 0, flagged: 0, clean_rate: 0, total_flags: 0 } });
    }

    const states = result.rows.map((r) => {
      const fm = typeof r.frontmatter === "string" ? JSON.parse(r.frontmatter) : r.frontmatter;
      return {
        guardrail_results: fm.guardrail_results as Record<number, {
          passed: boolean;
          flags_count: number;
          flag_types: string[];
          regenerated: boolean;
          regen_passed?: boolean;
        }> | undefined,
        cross_verify_results: fm.cross_verify_results as {
          clean: boolean;
          flags_count: number;
          flag_types: string[];
          regenerated: boolean;
          regen_clean?: boolean;
        } | undefined,
        status: fm.status as string,
        created_at: r.created_at,
      };
    }).filter((s) => s.guardrail_results || s.cross_verify_results);

    // Aggregate per-layer guardrail stats
    const layerStats: Record<number, {
      total: number;
      passed: number;
      flagged: number;
      total_flags: number;
      flag_types: Record<string, number>;
    }> = {};

    let crossVerifyTotal = 0;
    let crossVerifyClean = 0;
    let crossVerifyFlagged = 0;
    let crossVerifyTotalFlags = 0;

    for (const s of states) {
      if (s.guardrail_results) {
        for (const [layerStr, gr] of Object.entries(s.guardrail_results)) {
          const layer = Number(layerStr);
          if (!layerStats[layer]) {
            layerStats[layer] = {
              total: 0,
              passed: 0,
              flagged: 0,
              total_flags: 0,
              flag_types: {},
            };
          }
          layerStats[layer].total++;
          if (gr.passed) {
            layerStats[layer].passed++;
          } else {
            layerStats[layer].flagged++;
          }
          layerStats[layer].total_flags += gr.flags_count;
          for (const ft of gr.flag_types) {
            layerStats[layer].flag_types[ft] = (layerStats[layer].flag_types[ft] ?? 0) + 1;
          }
        }
      }
      if (s.cross_verify_results) {
        crossVerifyTotal++;
        if (s.cross_verify_results.clean) {
          crossVerifyClean++;
        } else {
          crossVerifyFlagged++;
        }
        crossVerifyTotalFlags += s.cross_verify_results.flags_count;
      }
    }

    // Convert to arrays for the frontend
    const byLayer = Object.entries(layerStats).map(([layer, stats]) => ({
      layer: Number(layer),
      ...stats,
      pass_rate: stats.total > 0 ? stats.passed / stats.total : 0,
    })).sort((a, b) => a.layer - b.layer);

    return apiSuccess({
      total_pipelines: states.length,
      by_layer: byLayer,
      cross_verify: {
        total: crossVerifyTotal,
        clean: crossVerifyClean,
        flagged: crossVerifyFlagged,
        clean_rate: crossVerifyTotal > 0 ? crossVerifyClean / crossVerifyTotal : 0,
        total_flags: crossVerifyTotalFlags,
      },
    });
  }
);
