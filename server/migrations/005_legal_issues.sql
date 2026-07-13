-- Migration 005: Legal Issues — Canonical Legal Issue Model (T1.1)
--
-- Tables: legal_issues
-- Stores structured, verifiable legal reasoning with evidence grounding.
--
-- Architecture:
--   legal_issues: One row per LegalIssue. Full JSONB in `data` column,
--   with indexed columns for common query fields (jurisdiction, status, etc.)
--   and JSONB GIN index on corpus_slugs for stale-marking lookups.
--
-- Invariants (enforced by application-layer validator):
--   I1: satisfied/not_satisfied requires verified EvidenceSpan
--   I2: unknown/disputed never auto-resolves to definitive conclusion
--   I3: jurisdiction and as_of_date are mandatory
--   I4: free agent text is not canonical truth

CREATE TABLE IF NOT EXISTS legal_issues (
  id              TEXT PRIMARY KEY,               -- UUID or slug-based
  title           TEXT NOT NULL,
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('DE', 'AT', 'CH', 'EU')),
  as_of_date      DATE NOT NULL,                   -- Stichtag (I3)
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'concluded', 'stale', 'blocked')),
  risk            TEXT NOT NULL DEFAULT 'medium'
                  CHECK (risk IN ('low', 'medium', 'high')),
  case_slug       TEXT,                            -- optional case file reference
  brain_id        TEXT,                            -- optional tenant/brain ID
  owner_id        TEXT,                            -- optional attorney user ID
  data            JSONB NOT NULL,                  -- full serialized LegalIssue
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_legal_issues_jurisdiction
    ON legal_issues (jurisdiction),

  CREATE INDEX IF NOT EXISTS idx_legal_issues_status
    ON legal_issues (status),

  CREATE INDEX IF NOT EXISTS idx_legal_issues_case
    ON legal_issues (case_slug) WHERE case_slug IS NOT NULL,

  CREATE INDEX IF NOT EXISTS idx_legal_issues_brain
    ON legal_issues (brain_id) WHERE brain_id IS NOT NULL,

  CREATE INDEX IF NOT EXISTS idx_legal_issues_owner
    ON legal_issues (owner_id) WHERE owner_id IS NOT NULL,

  CREATE INDEX IF NOT EXISTS idx_legal_issues_created
    ON legal_issues (created_at DESC),

  -- GIN index on corpus_slugs for stale-marking lookups
  CREATE INDEX IF NOT EXISTS idx_legal_issues_corpus_slugs
    ON legal_issues USING GIN ((data->'source_snapshot'->'corpus_slugs'))
);

-- Auto-update updated_at on row update
CREATE OR REPLACE FUNCTION legal_issues_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legal_issues_updated_at ON legal_issues;
CREATE TRIGGER trg_legal_issues_updated_at
  BEFORE UPDATE ON legal_issues
  FOR EACH ROW
  EXECUTE FUNCTION legal_issues_set_updated_at();
