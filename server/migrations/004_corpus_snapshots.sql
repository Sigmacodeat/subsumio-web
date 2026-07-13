-- Migration 004: Corpus Snapshots & Amendments — Persistent Source Provenance
--
-- Tables: corpus_snapshots, corpus_amendments, stale_outputs
-- Replaces in-memory snapshot in statute-freshness.ts with persistent storage.
--
-- Architecture:
--   corpus_snapshots: One row per version of a law (slug + valid_from = unique)
--   corpus_amendments: Per-§ changes detected between snapshots
--   stale_outputs: Outputs that cite §§ whose source law has been amended

-- ============================================================
-- corpus_snapshots: Versioned law corpus documents
-- ============================================================
CREATE TABLE IF NOT EXISTS corpus_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  slug            TEXT NOT NULL,               -- "law/de/bgb"
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('DE', 'AT', 'CH', 'EU')),
  statute_code    TEXT NOT NULL,               -- "BGB", "ABGB"
  valid_from      DATE NOT NULL,               -- when this version became effective
  valid_to        DATE,                        -- NULL = currently valid
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_url      TEXT NOT NULL,               -- official URL (never empty)
  content_hash    TEXT NOT NULL,               -- SHA-256 (64 hex chars)
  parser_version  TEXT NOT NULL,
  license_status  TEXT NOT NULL DEFAULT 'public' CHECK (license_status IN ('public', 'licensed', 'pending')),
  amendment_count INTEGER NOT NULL DEFAULT 0,
  announcement_date DATE,
  gazette_reference TEXT,
  language        TEXT NOT NULL DEFAULT 'de',
  paragraph_count INTEGER,
  receipt_json    TEXT,                        -- full serialized CorpusReceipt

  -- One active version per slug (valid_to IS NULL)
  UNIQUE (slug, valid_from),

  -- Index for looking up current version
  CREATE INDEX IF NOT EXISTS idx_corpus_snapshots_slug_current
    ON corpus_snapshots (slug) WHERE valid_to IS NULL,

  CREATE INDEX IF NOT EXISTS idx_corpus_snapshots_jurisdiction
    ON corpus_snapshots (jurisdiction),

  CREATE INDEX IF NOT EXISTS idx_corpus_snapshots_hash
    ON corpus_snapshots (content_hash)
);

-- ============================================================
-- corpus_amendments: Per-§ changes between snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS corpus_amendments (
  id              BIGSERIAL PRIMARY KEY,
  slug            TEXT NOT NULL,               -- "law/de/bgb"
  statute_code    TEXT NOT NULL,               -- "BGB"
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('DE', 'AT', 'CH', 'EU')),
  paragraph       TEXT NOT NULL,               -- "823", "823a"
  change_type     TEXT NOT NULL CHECK (change_type IN ('added', 'modified', 'removed')),
  old_hash        TEXT,                        -- previous content hash (16 chars)
  new_hash        TEXT,                        -- new content hash (16 chars)
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_url      TEXT,                        -- official URL
  announcement_date DATE,

  CREATE INDEX IF NOT EXISTS idx_corpus_amendments_slug
    ON corpus_amendments (slug),

  CREATE INDEX IF NOT EXISTS idx_corpus_amendments_paragraph
    ON corpus_amendments (slug, paragraph),

  CREATE INDEX IF NOT EXISTS idx_corpus_amendments_detected
    ON corpus_amendments (detected_at DESC)
);

-- ============================================================
-- stale_outputs: Outputs that may be affected by law changes
-- ============================================================
CREATE TABLE IF NOT EXISTS stale_outputs (
  id              BIGSERIAL PRIMARY KEY,
  output_id       TEXT NOT NULL,               -- pipeline run ID or draft slug
  output_type     TEXT NOT NULL,               -- "draft", "memo", "schriftsatz", "fristenauskunft"
  cited_slug      TEXT NOT NULL,               -- "law/de/bgb"
  cited_paragraph TEXT,                        -- "823" (if known)
  amendment_id    BIGINT REFERENCES corpus_amendments(id),
  marked_stale_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,                 -- when attorney reviewed and resolved
  resolved_by     TEXT,                        -- user ID who resolved

  CREATE INDEX IF NOT EXISTS idx_stale_outputs_output
    ON stale_outputs (output_id),

  CREATE INDEX IF NOT EXISTS idx_stale_outputs_unresolved
    ON stale_outputs (output_id) WHERE resolved_at IS NULL,

  CREATE INDEX IF NOT EXISTS idx_stale_outputs_slug
    ON stale_outputs (cited_slug, cited_paragraph)
);
