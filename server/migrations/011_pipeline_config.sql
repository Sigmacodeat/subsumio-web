-- Migration 011: Pipeline Config — dashboard-steuerbare Pipeline-Flags
--
-- Bisher war der Korpus-Pipeline-Pausenschalter nur die Env-Variable
-- PIPELINE_PAUSED (Container-Neustart nötig). Diese Key-Value-Tabelle macht
-- Pause/Resume aus dem Dashboard heraus möglich; der Orchestrator
-- (server/scripts/corpus-pipeline.ts) liest den DB-Wert bei jedem Zyklus.
-- Die Env-Variable bleibt als Fallback/Override für Incident-Situationen.

CREATE TABLE IF NOT EXISTS pipeline_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- Bekannte Keys:
--   'paused' → {"paused": true|false, "reason": "..."}
