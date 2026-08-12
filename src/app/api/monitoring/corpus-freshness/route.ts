import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/monitoring/corpus-freshness — Statute corpus freshness status.
 *
 * Returns the latest amendment detection results and freshness summary
 * for the statute corpus across all jurisdictions (DE, AT, CH, EU).
 *
 * Requires admin role.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    cacheMaxAge: 60,
  },
  async (_ctx) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    // Check if the statute_snapshots table exists
    let freshnessData: Record<string, unknown> | null = null;
    try {
      // Try to get the latest amendment check results from the audit log
      const snapshotResult = await pool.query(
        `SELECT * FROM subsumio_audit_log
         WHERE action = 'cron.law-sync'
         ORDER BY created_at DESC
         LIMIT 1`
      );

      if (snapshotResult.rows.length > 0) {
        const row = snapshotResult.rows[0] as { details?: Record<string, unknown> };
        if (row.details) {
          freshnessData = row.details;
        }
      }
    } catch {
      // Table might not exist yet — return empty state
    }

    // Get per-source freshness from source registry
    let sourceStats: Array<{ source_id: string; status: string; last_sync: string | null; doc_count: number }> = [];
    try {
      const sourceResult = await pool.query(
        `SELECT source_id, status, last_sync_at, document_count
         FROM subsumio_source_registry
         WHERE source_id LIKE 'law-%'
         ORDER BY source_id`
      );
      sourceStats = sourceResult.rows as Array<{ source_id: string; status: string; last_sync: string | null; doc_count: number }>;
    } catch {
      // Table might not exist
    }

    return apiSuccess({
      freshness: freshnessData,
      sources: sourceStats,
      last_updated: new Date().toISOString(),
    });
  }
);
