import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/ris-delta-watcher — täglicher RIS Delta-Sync.
 *
 * Schreibt einen Trigger in pipeline_config, der vom corpus-pipeline
 * Supervisor im nächsten Zyklus abgeholt wird. Der Supervisor startet
 * dann ris-delta-watcher.ts als Kindprozess.
 *
 * Der Trigger-Mechanismus ist derselbe wie bei reembed_triggered und
 * fetch_triggered: pipeline_config Key → JSON Value → Pipeline liest,
 * führt aus, löscht den Trigger.
 *
 * Zeitplan: server/deploy/netcup/crontab (02:30 UTC). Die Pipeline startet
 * den Lauf im nächsten Zyklus; Pacing/Lock liegen in den RIS-Skripten.
 *
 * Alarmierung: Ist der letzte Delta-Lauf gescheitert (Alarm
 * `delta_sync_failed` auf `ris-delta`, gesetzt und nach Erfolg wieder
 * gelöscht von corpus-pipeline.ts), antwortet die Route nach dem Setzen des
 * Triggers mit 500 — cronjob.sh meldet den Job dann als fehlgeschlagen und
 * mailt QUEUE_ALERT_EMAIL, statt den Heartbeat zu pingen.
 */
export const GET = createCronHandler(async (_req: NextRequest) => {
  const pool = getSharedPgPool();
  if (!pool) {
    return Response.json({ triggered: false, error: "DB not available" }, { status: 503 });
  }

  // Trigger in pipeline_config schreiben
  await pool.query(
    `INSERT INTO pipeline_config (key, value) VALUES ('delta_sync_triggered', '{"applikation": "all"}'::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = '{"applikation": "all"}'::jsonb`
  );

  const failed = await pool.query<{ message: string | null }>(
    `SELECT elem->>'message' AS message
       FROM pipeline_state, jsonb_array_elements(COALESCE(alert_flags, '[]'::jsonb)) AS elem
      WHERE source_key = 'ris-delta' AND elem->>'type' = 'delta_sync_failed'
      LIMIT 1`
  );
  if (failed.rows.length > 0) {
    return Response.json(
      {
        triggered: true,
        error: "Letzter RIS Delta-Sync fehlgeschlagen",
        code: "delta_sync_failed",
        message: failed.rows[0]!.message,
      },
      { status: 500 }
    );
  }

  return Response.json({
    triggered: true,
    message:
      "RIS Delta-Sync trigger gesetzt — corpus-pipeline wird ihn im nächsten Zyklus abarbeiten",
  });
});
