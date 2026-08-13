import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/corpus-command-center/trigger-delta
 *
 * Setzt den `delta_sync_triggered` Eintrag in pipeline_config, damit der
 * corpus-pipeline Supervisor im nächsten Zyklus den ris-delta-watcher
 * startet. Gleicher Mechanismus wie reembed_triggered.
 */
export const POST = createHandler({ action: "admin.*" }, async () => {
  const pool = getSharedPgPool();
  if (!pool) return apiSuccess({ triggered: false, error: "DB not available" });
  // BUG 46: try/catch wie bei anderen Trigger-Routes — sonst 500 crash
  // wenn pipeline_config-Tabelle fehlt (Migration 011 nicht angewendet).
  try {
    await pool.query(
      `INSERT INTO pipeline_config (key, value) VALUES ('delta_sync_triggered', '{"applikation": "all"}'::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = '{"applikation": "all"}'::jsonb`
    );
  } catch {
    return apiError(
      "migration_missing",
      "pipeline_config-Tabelle fehlt — Migration 011 anwenden",
      503
    );
  }

  return apiSuccess({ triggered: true });
});
