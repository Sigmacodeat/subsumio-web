import { createHandler, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export interface PipelineAlert {
  type: string;
  severity: string;
  message: string;
  raised_at: string;
}

export interface PipelineSourceRow {
  source_key: string;
  stage: string;
  disk_count: number;
  db_pages: number;
  ris_total: number | null;
  last_placeholder_count: number;
  backfill_exhausted: boolean;
  pid: number | null;
  pid_started_at: string | null;
  last_import_success: string | null;
  last_cycle_at: string | null;
  alert_flags: PipelineAlert[];
  stage_history: Array<{ stage: string; action: string; ts: string }>;
}

export interface CorpusPipelineResponse {
  paused: boolean;
  paused_reason: string | null;
  paused_updated_at: string | null;
  sources: PipelineSourceRow[];
  alert_count: number;
  generated_at: string;
}

/**
 * GET /api/monitoring/corpus-pipeline — Zustand des Korpus-Pipeline-Supervisors.
 *
 * Liest die `pipeline_state`-Tabelle (eine Zeile pro Source: Stage, Disk/DB-
 * Zähler, Alerts, Stage-Historie) plus den Dashboard-Pausenschalter aus
 * `pipeline_config`. Nur Admin.
 */
export const GET = createHandler(
  {
    action: "admin.*" as never,
    cacheMaxAge: 10,
  },
  async () => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    let sources: PipelineSourceRow[] = [];
    try {
      const res = await pool.query(
        `SELECT source_key, stage, disk_count, db_pages, ris_total,
                last_placeholder_count, backfill_exhausted, pid, pid_started_at,
                last_import_success, last_cycle_at, alert_flags, stage_history
           FROM pipeline_state
          ORDER BY source_key`
      );
      sources = res.rows.map((r) => ({
        source_key: String(r.source_key),
        stage: String(r.stage),
        disk_count: Number(r.disk_count ?? 0),
        db_pages: Number(r.db_pages ?? 0),
        ris_total: r.ris_total === null ? null : Number(r.ris_total),
        last_placeholder_count: Number(r.last_placeholder_count ?? 0),
        backfill_exhausted: Boolean(r.backfill_exhausted),
        pid: r.pid === null ? null : Number(r.pid),
        pid_started_at: r.pid_started_at ? new Date(r.pid_started_at).toISOString() : null,
        last_import_success: r.last_import_success
          ? new Date(r.last_import_success).toISOString()
          : null,
        last_cycle_at: r.last_cycle_at ? new Date(r.last_cycle_at).toISOString() : null,
        alert_flags: Array.isArray(r.alert_flags) ? (r.alert_flags as PipelineAlert[]) : [],
        stage_history: Array.isArray(r.stage_history)
          ? (r.stage_history as Array<{ stage: string; action: string; ts: string }>)
          : [],
      }));
    } catch {
      // Tabelle existiert noch nicht (Migration 008 nicht angewendet) —
      // leere Liste statt 500, das Panel zeigt den Hinweis.
      sources = [];
    }

    let paused = false;
    let pausedReason: string | null = null;
    let pausedUpdatedAt: string | null = null;
    try {
      const cfg = await pool.query(
        `SELECT value, updated_at FROM pipeline_config WHERE key = 'paused'`
      );
      if (cfg.rows[0]) {
        const value = cfg.rows[0].value as { paused?: boolean; reason?: string };
        paused = value?.paused === true;
        pausedReason = value?.reason ?? null;
        pausedUpdatedAt = cfg.rows[0].updated_at
          ? new Date(cfg.rows[0].updated_at).toISOString()
          : null;
      }
    } catch {
      // pipeline_config fehlt (Migration 011 nicht angewendet) — nicht pausiert.
    }

    const body: CorpusPipelineResponse = {
      paused,
      paused_reason: pausedReason,
      paused_updated_at: pausedUpdatedAt,
      sources,
      alert_count: sources.reduce((n, s) => n + s.alert_flags.length, 0),
      generated_at: new Date().toISOString(),
    };
    return Response.json(body);
  }
);
