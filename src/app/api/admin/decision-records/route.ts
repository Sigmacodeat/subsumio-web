/**
 * Admin Decision Records API — Audit-View für Agent-Entscheidungen.
 *
 * GET /api/admin/decision-records?case_slug=X  — Records für einen Case
 * GET /api/admin/decision-records?job_id=X     — Records für einen Job
 *
 * Wie OpenAI's Run Details View mit Tool-Call-Trace + Rationale.
 */

import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";

const querySchema = z.object({
  case_slug: z.string().optional(),
  job_id: z.string().optional(),
  limit: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    admin: true,
    query: querySchema,
  },
  async (ctx, _body, query, _req) => {
    if (!query || (!query.case_slug && !query.job_id)) {
      return apiError("invalid_request", "case_slug or job_id required", 400);
    }

    const limit = Math.min(parseInt(query.limit ?? "100", 10), 500);

    // Query the engine's decision_records table
    // This is a server-side admin operation — direct engine access
    const { getSharedPgPool } = await import("@/lib/auth/store");
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ ok: true, records: [], message: "no database configured" });
    }

    let rows: Record<string, unknown>[] = [];
    if (query.case_slug) {
      const result = await pool.query(
        `SELECT * FROM subsumio_decision_records
         WHERE case_slug = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [query.case_slug, limit]
      );
      rows = result.rows;
    } else if (query.job_id) {
      const result = await pool.query(
        `SELECT * FROM subsumio_decision_records
         WHERE job_id = $1
         ORDER BY layer ASC, id ASC`,
        [parseInt(query.job_id, 10)]
      );
      rows = result.rows;
    }

    // Format records for frontend
    const records = rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      specialist: r.specialist,
      layer: r.layer,
      layerName: r.layer_name,
      caseSlug: r.case_slug,
      model: r.model,
      modelTier: r.model_tier,
      queryOrTask: (r.query_or_task as string)?.slice(0, 200),
      toolsCalled: r.tools_called,
      alternativesConsidered: r.alternatives_considered,
      selectedApproach: r.selected_approach,
      confidence: r.confidence,
      reasoningSummary: r.reasoning_summary,
      finalOutputSummary: r.final_output_summary,
      tokensIn: r.tokens_in,
      tokensOut: r.tokens_out,
      tokensCacheRead: r.tokens_cache_read,
      durationMs: r.duration_ms,
      // v0.43.x EBTE Soft-Enforcement: compliance metrics
      ebteTotalToolCalls: r.ebte_total_tool_calls ?? 0,
      ebteMissingRationales: r.ebte_missing_rationales ?? 0,
      ebteComplianceRate: r.ebte_compliance_rate ?? 1.0,
      createdAt: r.created_at,
    }));

    return Response.json({ ok: true, records });
  }
);
