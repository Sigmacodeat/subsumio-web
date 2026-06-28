import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

/**
 * GET /api/admin/queue-health
 *
 * Ops/DLQ observability for the ingestion + agent pipeline. Proxies the
 * engine's /api/jobs/health (minion-queue depth, per-type failed/dead, wedge
 * signal, outbox dead-letter counts). Used by the monitoring dashboard panel
 * and the queue-alert cron. Degrades gracefully when the engine is unreachable
 * so the dashboard stays usable.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/jobs/health`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Response.json({ ...data, engine_reachable: true });
    } catch (err) {
      console.error(
        "[admin/queue-health] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return Response.json(
        {
          by_status: {},
          by_type: [],
          queue_health: { waiting: 0, active: 0, stalled: 0 },
          wedge: null,
          dead_letter: { outbox_exhausted: null, docs_failed: null },
          engine_reachable: false,
        },
        { status: 200 }
      );
    }
  }
);
