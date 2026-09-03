/**
 * Admin Dissensus API — aggregiert Ensemble-Critic Dissensus-Daten.
 *
 * GET /api/admin/dissensus?limit=20  — letzte N quality-audit Pages mit Dissensus
 *
 * Liest aus der Engine's pages-Tabelle (type: quality_audit) via shared PG pool.
 * Dissensus-Felder sind im Frontmatter (dissensus_disagreement_score, etc.)
 * und als JSON-Block im Page-Text.
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";

const querySchema = z.object({
  limit: z.string().optional(),
});

interface DissensusRun {
  case_slug: string;
  disagreement_score: number;
  recommendation_split: Record<string, number>;
  score_spread: number;
  contested_layers: string[];
  key_disagreements: Array<{ issue: string; raised_by: string[]; dismissed_by: string[] }>;
  summary: string;
  created_at?: string;
}

export const GET = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    admin: true,
    query: querySchema,
  },
  async (ctx, _body, query, _req) => {
    const limit = Math.min(parseInt(query?.limit ?? "20", 10), 100);

    // Query the engine's pages table for quality_audit pages with dissensus data
    const { getSharedPgPool } = await import("@/lib/auth/store");
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({
        ok: true,
        runs: [],
        summary: { total_runs: 0, avg_disagreement: 0, contested_layers: [] },
      });
    }

    // Query pages with type=quality_audit that have dissensus frontmatter
    const result = await pool.query(
      `SELECT slug, frontmatter, compiled_truth, created_at
       FROM pages
       WHERE frontmatter->>'type' = 'quality_audit'
         AND frontmatter ? 'dissensus_disagreement_score'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    const runs: DissensusRun[] = [];

    for (const row of result.rows) {
      const fm = (row.frontmatter ?? {}) as Record<string, unknown>;
      const text = (row.compiled_truth as string) ?? "";

      // Parse key_disagreements from JSON block in page text
      let keyDisagreements: DissensusRun["key_disagreements"] = [];
      const jsonMatch = text.match(/### Dissensus Analysis[\s\S]*?```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          keyDisagreements = parsed.key_disagreements ?? [];
        } catch {
          // Skip unparseable
        }
      }

      const disagreementScore = Number(fm.dissensus_disagreement_score ?? 0);
      const caseSlug = String(fm.case_ref ?? row.slug ?? "").replace("quality-audits/", "");

      // Parse recommendation_split from frontmatter
      let recommendationSplit: Record<string, number> = {};
      try {
        recommendationSplit =
          typeof fm.dissensus_recommendation_split === "string"
            ? JSON.parse(fm.dissensus_recommendation_split)
            : ((fm.dissensus_recommendation_split as Record<string, number>) ?? {});
      } catch {
        // Keep empty
      }

      // Parse contested_layers from frontmatter (YAML array)
      const contestedLayers = Array.isArray(fm.dissensus_contested_layers)
        ? fm.dissensus_contested_layers.map(String)
        : [];

      const summary =
        disagreementScore > 0
          ? `Models disagree (score: ${disagreementScore}, spread: ${fm.dissensus_score_spread ?? 0}).`
          : `Models agree (spread: ${fm.dissensus_score_spread ?? 0}).`;

      runs.push({
        case_slug: caseSlug,
        disagreement_score: disagreementScore,
        recommendation_split: recommendationSplit,
        score_spread: Number(fm.dissensus_score_spread ?? 0),
        contested_layers: contestedLayers,
        key_disagreements: keyDisagreements,
        summary,
        created_at: row.created_at as string | undefined,
      });
    }

    // Aggregate summary
    const totalRuns = runs.length;
    const avgDisagreement =
      totalRuns > 0 ? runs.reduce((sum, r) => sum + r.disagreement_score, 0) / totalRuns : 0;

    const layerCounts: Record<string, number> = {};
    for (const run of runs) {
      for (const layer of run.contested_layers) {
        layerCounts[layer] = (layerCounts[layer] ?? 0) + 1;
      }
    }
    const contestedLayers = Object.entries(layerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([layer, count]) => ({ layer, count }));

    return Response.json({
      ok: true,
      runs: runs.sort((a, b) => b.disagreement_score - a.disagreement_score),
      summary: {
        total_runs: totalRuns,
        avg_disagreement: Math.round(avgDisagreement * 100) / 100,
        contested_layers: contestedLayers,
      },
    });
  }
);
