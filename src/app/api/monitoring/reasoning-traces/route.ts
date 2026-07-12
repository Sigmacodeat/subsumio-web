import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { exportTracesCSV, type ReasoningTrace } from "@/lib/ai-reasoning-trace";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const querySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  limit: z.coerce.number().min(1).max(500).default(100),
});

/**
 * GET /api/monitoring/reasoning-traces — List reasoning traces (EU AI Act Art. 12).
 *
 * Returns AI reasoning traces for compliance audits. Supports CSV export
 * in EU AI Act Art. 13 format.
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
    const { format, limit } = query as {
      format: "json" | "csv";
      limit: number;
    };

    const pool = getSharedPgPool();
    if (!pool) {
      return apiSuccess({ traces: [], count: 0 });
    }

    const result = await pool.query(
      `SELECT * FROM subsumio_reasoning_traces
       WHERE brain_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [ctx.brainId, limit]
    );

    const traces = result.rows as unknown as ReasoningTrace[];

    if (format === "csv") {
      const csv = exportTracesCSV(traces);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="reasoning-traces-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return apiSuccess({ traces, count: traces.length });
  }
);
