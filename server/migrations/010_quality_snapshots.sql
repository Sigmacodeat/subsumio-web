-- Quality Snapshots — persistent daily/ondemand corpus quality reports for trend analysis

CREATE TABLE IF NOT EXISTS quality_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id TEXT NOT NULL DEFAULT 'default',
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  report JSONB NOT NULL,
  health_score INT NOT NULL DEFAULT 0,
  corpus_total_pages INT NOT NULL DEFAULT 0,
  corpus_total_chunks INT NOT NULL DEFAULT 0,
  embedding_coverage_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  hallucination_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  guardrail_pass_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_snapshots_brain_date
  ON quality_snapshots (brain_id, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_quality_snapshots_brain_generated
  ON quality_snapshots (brain_id, generated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_snapshots_brain_date_unique
  ON quality_snapshots (brain_id, report_date);

COMMENT ON TABLE quality_snapshots IS 'Stores daily corpus quality reports to enable trend analysis and regression detection.';
