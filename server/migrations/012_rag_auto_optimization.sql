-- Migration 012: RAG Auto-Optimization & Auto-Ingestion Queue
-- Tracks sweep runs, reusable sweep templates, and the nightly statute ingestion queue.

CREATE TABLE IF NOT EXISTS rag_optimization_runs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('baseline','sweep','auto','ingest','final')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','rolled_back')),
  params JSONB NOT NULL DEFAULT '{}',
  baseline_id INTEGER REFERENCES rag_optimization_runs(id) ON DELETE SET NULL,
  results JSONB,
  cost_estimate_usd NUMERIC,
  latency_p95_ms INTEGER,
  applied_at TIMESTAMPTZ,
  created_by TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_runs_status_created ON rag_optimization_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_runs_baseline ON rag_optimization_runs(baseline_id);
CREATE INDEX IF NOT EXISTS idx_rag_runs_created_by ON rag_optimization_runs(created_by);

CREATE TABLE IF NOT EXISTS rag_sweep_configs (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  param_grid JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_sweep_default ON rag_sweep_configs(is_default) WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS law_ingestion_queue (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('statute','judgement','regulation')),
  status TEXT NOT NULL CHECK (status IN ('queued','fetching','chunking','embedding','indexing','done','error','skipped')),
  priority INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  retries INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_law_queue_status_scheduled ON law_ingestion_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_law_queue_jurisdiction ON law_ingestion_queue(jurisdiction);

-- Seed a default conservative sweep template
INSERT INTO rag_sweep_configs (name, description, param_grid, is_default)
VALUES (
  'default',
  'Standard Auto-Sweep: ef_search, LLM re-ranker topNIn, and keyword/hybrid tunables.',
  '{
    "hnsw.ef_search": [64, 128, 256],
    "llmRerank.enabled": [false, true],
    "llmRerank.topNIn": [20, 40],
    "llmRerank.model": ["openrouter:deepseek/deepseek-chat"]
  }'::jsonb,
  true
)
ON CONFLICT (name) DO NOTHING;
