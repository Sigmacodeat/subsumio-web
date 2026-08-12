import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/corpus-command-center/trigger-delta
 *
 * Setzt den `delta_sync_triggered` Eintrag in pipeline_config, damit der
 * corpus-pipeline Supervisor im nächsten Zyklus den ris-delta-watcher
 * startet. Gleicher Mechanismus wie reembed_triggered.
 */
export const POST = createHandler(
  { action: "admin.*" },
  async () => {
    const pool = getSharedPgPool();
    if (!pool) return apiSuccess({ triggered: false, error: "DB not available" });
    await pool.query(
      `INSERT INTO pipeline_config (key, value) VALUES ('delta_sync_triggered', '{"applikation": "all"}'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = '{"applikation": "all"}'::jsonb`
    );

    return apiSuccess({ triggered: true });
  },
);
