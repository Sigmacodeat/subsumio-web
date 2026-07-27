import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { getQualityTrends } from "@/lib/quality-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * GET /api/monitoring/quality-trends
 *
 * Returns the latest N quality snapshots for the current brain.
 */
export const GET = createHandler(
  {
    action: "admin.*" as never,
    cacheMaxAge: 60,
  },
  async (ctx) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    try {
      const snapshots = await getQualityTrends(ctx.brainId, 30);
      return apiSuccess({ snapshots: snapshots.reverse() });
    } catch (err) {
      console.error("[GET /api/monitoring/quality-trends]", err);
      return apiError("internal_error", "Failed to load quality trends", 500);
    }
  }
);
