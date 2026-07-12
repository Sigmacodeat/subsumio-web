-- ──────────────────────────────────────────────────────────────────────
-- Gap 7: Transition-Level Audit Log — EU AI Act Art. 12
--
-- Full reasoning trace for every AI output, immutable, hash-chained.
-- Linked to the existing audit log via audit_id.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subsumio_reasoning_traces (
  trace_id            TEXT PRIMARY KEY,          -- UUID v4
  audit_id            BIGINT,                    -- FK to subsumio_audit_log.id
  brain_id            TEXT NOT NULL,
  user_id             TEXT,
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Input
  query               TEXT NOT NULL,
  query_hash          TEXT NOT NULL,             -- SHA-256 of query
  jurisdiction        TEXT,
  search_mode         TEXT,
  
  -- Retrieval
  retrieved_chunks    JSONB NOT NULL DEFAULT '[]',  -- [{slug, score, rank, source}]
  pages_gathered      INTEGER NOT NULL DEFAULT 0,
  takes_gathered      INTEGER NOT NULL DEFAULT 0,
  graph_hits          INTEGER NOT NULL DEFAULT 0,
  
  -- Model
  model_used          TEXT NOT NULL,
  system_prompt_hash  TEXT NOT NULL,             -- SHA-256 of system prompt
  max_tokens          INTEGER,
  
  -- Guardrails
  guardrail_passed    BOOLEAN,
  guardrail_flags     JSONB,                     -- Array of flags
  cross_verify_clean  BOOLEAN,
  cross_verify_flags  JSONB,
  ensemble_clean      BOOLEAN,
  ensemble_flags      JSONB,
  ensemble_method     TEXT,
  regeneration_count  INTEGER NOT NULL DEFAULT 0,
  
  -- Adversarial defense
  injection_detected  BOOLEAN NOT NULL DEFAULT false,
  injection_blocked   BOOLEAN NOT NULL DEFAULT false,
  injection_flags     JSONB,
  
  -- Output
  final_answer_hash   TEXT NOT NULL,             -- SHA-256 of answer
  answer_length       INTEGER NOT NULL DEFAULT 0,
  citations           JSONB NOT NULL DEFAULT '[]',
  confidence_level    TEXT,
  overall_confidence  REAL,
  provenance_links    JSONB,
  
  -- Integrity
  prev_trace_hash     TEXT,                      -- Hash-chaining: SHA-256 of previous trace
  trace_hash          TEXT NOT NULL,             -- SHA-256 of this trace's content
  
  -- Metadata
  latency_ms          INTEGER,
  warnings            JSONB NOT NULL DEFAULT '[]',
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_traces_brain ON subsumio_reasoning_traces(brain_id);
CREATE INDEX IF NOT EXISTS idx_traces_user ON subsumio_reasoning_traces(user_id);
CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON subsumio_reasoning_traces(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_traces_audit ON subsumio_reasoning_traces(audit_id);
CREATE INDEX IF NOT EXISTS idx_traces_hash ON subsumio_reasoning_traces(trace_hash);
CREATE INDEX IF NOT EXISTS idx_traces_query_hash ON subsumio_reasoning_traces(query_hash);

-- Retention: configurable, default 10 years
-- (enforced by a scheduled cleanup job, not by DB TTL)

-- Prevent updates/deletes (immutable audit trail)
-- This trigger raises an exception on UPDATE or DELETE
CREATE OR REPLACE FUNCTION prevent_trace_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'subsumio_reasoning_traces is immutable (EU AI Act Art. 12)';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_update_traces ON subsumio_reasoning_traces;
CREATE TRIGGER no_update_traces BEFORE UPDATE ON subsumio_reasoning_traces
  FOR EACH ROW EXECUTE FUNCTION prevent_trace_modification();

DROP TRIGGER IF EXISTS no_delete_traces ON subsumio_reasoning_traces;
CREATE TRIGGER no_delete_traces BEFORE DELETE ON subsumio_reasoning_traces
  FOR EACH ROW EXECUTE FUNCTION prevent_trace_modification();
