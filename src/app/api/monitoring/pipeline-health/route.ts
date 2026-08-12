import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/monitoring/pipeline-health — Pipeline runtime health.
 *
 * Proxies the engine /api/jobs/health endpoint plus local DB activity metrics.
 * Requires admin role.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    cacheMaxAge: 15,
  },
  async (ctx) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    try {
      // ── 1. Engine / Jobs Health ──
      let engine_health: {
        status: "ok" | "degraded" | "error" | "unreachable";
        jobs?: { pending: number; active: number; failed_1h: number };
        outbox_exhausted?: number;
        docs_failed?: number;
        corpus_completeness?: Record<string, number>;
      } = { status: "unreachable" };
      try {
        const res = await fetch(`${ENGINE_URL}/api/jobs/health`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          const body = (await res.json()) as Record<string, unknown>;
          engine_health = {
            status: (body.status as "ok" | "degraded" | "error") ?? "ok",
            jobs: body.jobs as { pending: number; active: number; failed_1h: number } | undefined,
            outbox_exhausted:
              typeof body.outbox_exhausted === "number" ? body.outbox_exhausted : undefined,
            docs_failed: typeof body.docs_failed === "number" ? body.docs_failed : undefined,
            corpus_completeness: body.corpus_completeness as Record<string, number> | undefined,
          };
        } else {
          engine_health = { status: "error" };
        }
      } catch {
        engine_health = { status: "unreachable" };
      }

      // ── 2. DB Activity / Locks ──
      let db_activity: {
        active_connections: number;
        idle_connections: number;
        waiting_on_locks: number;
      } = { active_connections: 0, idle_connections: 0, waiting_on_locks: 0 };
      try {
        const activityResult = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE state = 'active')::int AS active_connections,
            COUNT(*) FILTER (WHERE state = 'idle')::int AS idle_connections,
            COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::int AS waiting_on_locks
          FROM pg_stat_activity
        `);
        db_activity = activityResult.rows[0] ?? db_activity;
      } catch {
        // graceful
      }

      // ── 3. HNSW Index Check ──
      let hnsw_index_exists = false;
      try {
        const indexResult = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'content_chunks'
            AND indexdef ILIKE '%hnsw%'
          ) AS exists
        `);
        hnsw_index_exists = indexResult.rows[0]?.exists ?? false;
      } catch {
        // graceful
      }

      // ── 4. Pending Embeddings (proxy for worker backlog) ──
      let pending_embeddings = 0;
      try {
        const pendingResult = await pool.query(`
          SELECT COUNT(*)::int AS n
          FROM content_chunks cc
          JOIN pages p ON p.id = cc.page_id
          WHERE p.deleted_at IS NULL AND cc.embedding IS NULL
        `);
        pending_embeddings = pendingResult.rows[0]?.n ?? 0;
      } catch {
        // graceful
      }

      // ── 5. Checks ──
      const checks: Array<{ name: string; status: "ok" | "warn" | "fail"; message: string }> = [];

      checks.push({
        name: "engine_reachable",
        status:
          engine_health.status === "ok"
            ? "ok"
            : engine_health.status === "unreachable"
              ? "fail"
              : "warn",
        message:
          engine_health.status === "ok"
            ? "Engine erreichbar"
            : `Engine Status: ${engine_health.status}`,
      });

      if (engine_health.outbox_exhausted !== undefined) {
        checks.push({
          name: "outbox_exhausted",
          status: engine_health.outbox_exhausted === 0 ? "ok" : "warn",
          message: `${engine_health.outbox_exhausted} outbox Einträge erschöpft`,
        });
      }

      if (engine_health.docs_failed !== undefined) {
        checks.push({
          name: "docs_failed",
          status:
            engine_health.docs_failed === 0
              ? "ok"
              : engine_health.docs_failed < 10
                ? "warn"
                : "fail",
          message: `${engine_health.docs_failed} Dokumente permanent fehlgeschlagen`,
        });
      }

      checks.push({
        name: "hnsw_index",
        status: hnsw_index_exists ? "ok" : "warn",
        message: hnsw_index_exists ? "HNSW Vector-Index aktiv" : "HNSW Vector-Index nicht gefunden",
      });

      checks.push({
        name: "pending_embeddings",
        status: pending_embeddings === 0 ? "ok" : pending_embeddings < 1000 ? "warn" : "fail",
        message: `${pending_embeddings.toLocaleString()} Chunks warten auf Embedding`,
      });

      checks.push({
        name: "db_locks",
        status:
          db_activity.waiting_on_locks === 0
            ? "ok"
            : db_activity.waiting_on_locks < 5
              ? "warn"
              : "fail",
        message: `${db_activity.waiting_on_locks} Connections warten auf Lock`,
      });

      const fails = checks.filter((c) => c.status === "fail").length;
      const warns = checks.filter((c) => c.status === "warn").length;
      const status = fails > 0 ? "unhealthy" : warns > 0 ? "degraded" : "healthy";

      return apiSuccess({
        status,
        engine: engine_health,
        db: db_activity,
        hnsw_index_exists,
        pending_embeddings,
        checks,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(
        "[pipeline-health] Failed to generate:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "internal_error",
        err instanceof Error ? err.message : "Failed to generate pipeline health",
        500
      );
    }
  }
);
