import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { redactTraceForDisplay, type ReasoningTrace } from "@/lib/ai-reasoning-trace";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/monitoring/reasoning-traces/[trace_id] — Get a single reasoning trace.
 *
 * Returns the full reasoning trace for a given trace_id, including
 * retrieved chunks, guardrail flags, and hash chain verification.
 *
 * Requires admin role.
 */
export const GET = createHandler(
  {
    action: "admin.*" as never,
    cacheMaxAge: 0,
  },
  async (ctx, _body, _query, req: NextRequest) => {
    const routeContext = (req as unknown as { params?: Promise<Record<string, string>> });
    const params = routeContext.params ? await routeContext.params : {};
    const trace_id = params.trace_id;

    if (!trace_id) {
      return apiError("validation_failed", "Missing trace_id", 400);
    }

    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    const result = await pool.query(
      `SELECT * FROM subsumio_reasoning_traces
       WHERE trace_id = $1 AND brain_id = $2
       LIMIT 1`,
      [trace_id, ctx.brainId]
    );

    if (result.rows.length === 0) {
      return apiError("not_found", "Trace not found", 404);
    }

    const redacted = redactTraceForDisplay(result.rows[0] as unknown as ReasoningTrace);

    return apiSuccess({ trace: redacted });
  }
);
