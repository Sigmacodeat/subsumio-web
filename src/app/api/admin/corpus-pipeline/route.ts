import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pause"),
    reason: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal("resume") }),
  z.object({
    action: z.literal("clear_alerts"),
    source_key: z.string().min(1).max(100),
  }),
]);

/**
 * POST /api/admin/corpus-pipeline — Korpus-Pipeline steuern.
 *
 * - pause/resume: setzt den `pipeline_config`-Pausenschalter, den der
 *   Supervisor (corpus-pipeline.ts) bei jedem Zyklus liest. Die Env-Variable
 *   PIPELINE_PAUSED bleibt als Incident-Override wirksam (OR-Verknüpfung).
 * - clear_alerts: leert alert_flags einer Source (z.B. nach manueller
 *   Behebung eines reconcile_gap).
 *
 * Nur Admin; jede Aktion landet im Audit-Log.
 */
export const POST = createHandler(
  {
    action: "admin.*" as never,
    rateTier: "standard",
    body: actionSchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "corpus_pipeline",
      details: body as Record<string, unknown>,
    }),
  },
  async (ctx, body) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    if (body.action === "pause" || body.action === "resume") {
      const value = {
        paused: body.action === "pause",
        reason: body.action === "pause" ? (body.reason ?? null) : null,
      };
      try {
        await pool.query(
          `INSERT INTO pipeline_config (key, value, updated_at, updated_by)
           VALUES ('paused', $1::jsonb, NOW(), $2)
           ON CONFLICT (key)
           DO UPDATE SET value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
          [JSON.stringify(value), ctx.user.email]
        );
      } catch {
        return apiError(
          "migration_missing",
          "pipeline_config-Tabelle fehlt — Migration 011_pipeline_config.sql anwenden",
          503
        );
      }
      return Response.json({ ok: true, paused: value.paused });
    }

    // clear_alerts
    const res = await pool.query(
      `UPDATE pipeline_state
          SET alert_flags = '[]'::jsonb, updated_at = NOW()
        WHERE source_key = $1`,
      [body.source_key]
    );
    if (res.rowCount === 0) {
      return apiError("not_found", `Source "${body.source_key}" nicht in pipeline_state`, 404);
    }
    return Response.json({ ok: true, cleared: body.source_key });
  }
);
