-- Migration 008: Corpus Pipeline State — DB-backed orchestration state machine
--
-- Replaces the JSON-file state (~/.subsumio-corpus-pipeline.json) with a
-- durable, multi-instance-safe DB table. Each source has one row tracking
-- its position in the pipeline: backfill → import → embed → reconcile.
--
-- Design:
--   - SELECT FOR UPDATE on per-source rows prevents race conditions between
--     concurrent supervisor instances (Hetzner: container restart, multi-worker).
--   - pid column tracks the OS process of the currently running child,
--     enabling timeout enforcement and stale-lock detection.
--   - stage_history (JSONB) keeps a rolling log of stage transitions for
--     observability without a separate log table.
--   - alert_flags (JSONB) stores structured alert state for the monitoring
--     layer (reconciliation gaps, quarantine growth, stage failures).

CREATE TABLE IF NOT EXISTS pipeline_state (
  source_key       TEXT PRIMARY KEY,                           -- "statutes-at", "jud-ogh", "eu-directives", ...
  stage            TEXT NOT NULL DEFAULT 'idle' CHECK (stage IN (
    'idle',
    'backfill-pending',
    'backfilling',
    'import-pending',
    'importing',
    'waiting-for-statutes',
    'waiting-for-ris-slot',
    'done',
    'failed',
    'exhausted',
    'ok'
  )),
  -- Last successful import timestamp (files newer than this ⇒ re-import needed)
  last_import_success  TIMESTAMPTZ,
  -- Timestamp when we started an import that hasn't been observed finished yet
  pending_import_since TIMESTAMPTZ,
  -- OS PID of the currently running child process (NULL = no process)
  pid              INTEGER,
  -- Command line of the running child (for stale-lock diagnosis)
  pid_cmd          TEXT,
  -- When the current child process was started (for timeout enforcement)
  pid_started_at   TIMESTAMPTZ,
  -- Configurable timeout in seconds for this source's child processes
  pid_timeout_s    INTEGER NOT NULL DEFAULT 3600,              -- 1 hour default
  -- Placeholder tracking (for backfill exhaustion detection)
  last_placeholder_count   INTEGER NOT NULL DEFAULT 0,
  pending_backfill_ph      INTEGER,                            -- placeholder count when backfill started
  backfill_exhausted       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Reconciliation metrics (updated each cycle)
  disk_count       INTEGER NOT NULL DEFAULT 0,
  db_pages         INTEGER NOT NULL DEFAULT 0,
  ris_total        INTEGER,                                    -- NULL = unknown / not applicable
  -- Structured alert state
  alert_flags      JSONB NOT NULL DEFAULT '[]'::jsonb,         -- [{type, severity, message, raised_at}]
  -- Rolling stage history (last 20 entries)
  stage_history    JSONB NOT NULL DEFAULT '[]'::jsonb,         -- [{stage, action, ts}]
  -- Timestamps
  last_cycle_at    TIMESTAMPTZ,                                -- when the supervisor last checked this source
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient "find sources needing attention" queries
CREATE INDEX IF NOT EXISTS idx_pipeline_state_stage
  ON pipeline_state (stage)
  WHERE stage NOT IN ('idle', 'done', 'exhausted');

-- Index for stale-PID detection (find processes that exceeded their timeout)
CREATE INDEX IF NOT EXISTS idx_pipeline_state_pid_started
  ON pipeline_state (pid_started_at)
  WHERE pid IS NOT NULL;

-- -- Helper: atomically claim a source for processing.
-- Returns TRUE if the caller acquired the lock (row was updated).
-- This prevents two supervisor instances from starting the same import.
--
-- Usage:
--   SELECT * FROM claim_pipeline_source('jud-ogh', 12345, 'bun scripts/backfill...');
--   -- if returns true, caller owns the source until release_pipeline_source()
CREATE OR REPLACE FUNCTION claim_pipeline_source(
  p_source_key   TEXT,
  p_pid          INTEGER,
  p_pid_cmd      TEXT,
  p_timeout_s    INTEGER DEFAULT 3600
) RETURNS BOOLEAN AS $$
DECLARE
  claimed BOOLEAN := FALSE;
BEGIN
  -- Atomic claim: only succeed if no other PID holds this source,
  -- or the existing PID is stale (started > timeout_s ago).
  UPDATE pipeline_state
    SET pid = p_pid,
        pid_cmd = p_pid_cmd,
        pid_started_at = NOW(),
        pid_timeout_s = p_timeout_s,
        updated_at = NOW()
    WHERE source_key = p_source_key
      AND (
        pid IS NULL
        OR pid_started_at < NOW() - (pid_timeout_s::text || ' seconds')::INTERVAL
      )
    RETURNING TRUE INTO claimed;

  RETURN COALESCE(claimed, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Helper: release a source (clear PID, optionally update stage).
CREATE OR REPLACE FUNCTION release_pipeline_source(
  p_source_key   TEXT,
  p_pid          INTEGER,
  p_new_stage    TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  -- Only release if the caller owns the PID (prevents stale-release by wrong instance)
  UPDATE pipeline_state
    SET pid = NULL,
        pid_cmd = NULL,
        pid_started_at = NULL,
        stage = COALESCE(p_new_stage, stage),
        updated_at = NOW()
    WHERE source_key = p_source_key
      AND pid = p_pid;
END;
$$ LANGUAGE plpgsql;

-- Helper: append to stage_history (keeps last 20 entries)
CREATE OR REPLACE FUNCTION append_stage_history(
  p_source_key   TEXT,
  p_stage        TEXT,
  p_action       TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE pipeline_state
    SET stage_history = (
      SELECT jsonb_agg(elem ORDER BY idx ASC)
      FROM (
        SELECT elem
        FROM jsonb_array_elements(
          stage_history || jsonb_build_array(jsonb_build_object('stage', p_stage, 'action', p_action, 'ts', NOW()))
        ) WITH ORDINALITY AS t(elem, idx)
        ORDER BY idx DESC
        LIMIT 20
      ) sub
    ),
    updated_at = NOW()
    WHERE source_key = p_source_key;
END;
$$ LANGUAGE plpgsql;
