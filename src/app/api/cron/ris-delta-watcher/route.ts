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
 * RIS OGD Compliance: 04:00 UTC (06:00 CEST) — außerhalb Bürozeiten.
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

  return Response.json({
    triggered: true,
    message: "RIS Delta-Sync trigger gesetzt — corpus-pipeline wird ihn im nächsten Zyklus abarbeiten",
  });
});
