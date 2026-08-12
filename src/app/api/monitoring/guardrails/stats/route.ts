import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getGuardrailStats } from "@/lib/guardrail-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  hours: z.coerce.number().min(1).max(168).default(24),
});

/**
 * GET /api/monitoring/guardrails/stats — Guardrail metrics for admin dashboard.
 *
 * Returns aggregated Tier-0 and Tier-1 guardrail stats for the last N hours.
 * Default: 24 hours. Max: 168 (7 days).
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
    const stats = await getGuardrailStats(ctx.brainId, hours);
    return apiSuccess(stats);
  }
);
