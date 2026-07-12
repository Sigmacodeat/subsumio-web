import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { klassifiziereFrist, toISODate } from "@/lib/legal/frist-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  hours: z.coerce.number().min(1).max(168 * 7).default(168),
});

/**
 * GET /api/monitoring/guardrails/fristen-stats — Fristen-Engine metrics.
 *
 * Aggregates `legal_deadline` pages with deterministic frist-engine data
 * for the admin dashboard. Shows:
 *   - Total deadlines detected (deterministic vs non-deterministic)
 *   - By frist_art (Berufung, Klagebeantwortung, etc.)
 *   - By regime (zpo, avg, stpo, materiell)
 *   - Classification (ok, vorfrist, kritisch, ueberfaellig)
 *   - LLM fallback usage rate
 *   - Source breakdown (ai_detected, llm_detected, pipeline)
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
    const hours = (query as { hours: number }).hours;
    const sourceId = ctx.headers["x-subsumio-source"]?.trim();
    // Frist metrics contain matter metadata. Fail closed when the authenticated
    // request has no tenant/brain scope instead of aggregating all firms.
    if (!sourceId) {
      return apiError("tenant_scope_required", "Tenant scope is required for deadline metrics", 400);
    }
    const pool = getSharedPgPool();
    if (!pool) {
      return apiSuccess({
        total: 0,
        deterministic: 0,
        non_deterministic: 0,
        by_art: [],
        by_regime: [],
        by_classification: { ok: 0, vorfrist: 0, kritisch: 0, ueberfaellig: 0 },
        by_source: {},
        llm_fallback_rate: 0,
      });
    }

    const result = await pool.query(
      `SELECT frontmatter, created_at
       FROM pages
       WHERE source_id = $2
         AND slug LIKE 'legal/deadline%'
         AND created_at >= now() - ($1 * interval '1 hour')
       ORDER BY created_at DESC
       LIMIT 500`,
      [hours, sourceId],
    );

    const heute = toISODate(new Date());

    let total = 0;
    let deterministic = 0;
    let nonDeterministic = 0;
    let llmDetected = 0;

    const byArt: Record<string, { total: number; deterministic: number }> = {};
    const byRegime: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byClassification = { ok: 0, vorfrist: 0, kritisch: 0, ueberfaellig: 0 };

    for (const row of result.rows) {
      const fm = typeof row.frontmatter === "string" ? JSON.parse(row.frontmatter) : row.frontmatter;
      if (!fm || fm.type !== "deadline") continue;

      total++;
      const isDeterministic = fm.deterministic === true;
      if (isDeterministic) deterministic++;
      else nonDeterministic++;

      const source = fm.source ?? "unknown";
      bySource[source] = (bySource[source] ?? 0) + 1;
      if (source === "llm_detected") llmDetected++;

      if (fm.frist_art) {
        if (!byArt[fm.frist_art]) byArt[fm.frist_art] = { total: 0, deterministic: 0 };
        byArt[fm.frist_art].total++;
        if (isDeterministic) byArt[fm.frist_art].deterministic++;
      }

      if (fm.frist_regime) {
        byRegime[fm.frist_regime] = (byRegime[fm.frist_regime] ?? 0) + 1;
      }

      // Classification using fristende
      if (fm.fristende) {
        const status = klassifiziereFrist(fm.fristende, heute);
        byClassification[status]++;
      }
    }

    const byArtArray = Object.entries(byArt)
      .map(([art, stats]) => ({
        art,
        total: stats.total,
        deterministic: stats.deterministic,
        deterministic_rate: stats.total > 0 ? stats.deterministic / stats.total : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const byRegimeArray = Object.entries(byRegime)
      .map(([regime, count]) => ({ regime, count }))
      .sort((a, b) => b.count - a.count);

    return apiSuccess({
      total,
      deterministic,
      non_deterministic: nonDeterministic,
      deterministic_rate: total > 0 ? deterministic / total : 0,
      by_art: byArtArray,
      by_regime: byRegimeArray,
      by_classification: byClassification,
      by_source: bySource,
      llm_fallback_rate: total > 0 ? llmDetected / total : 0,
    });
  }
);
