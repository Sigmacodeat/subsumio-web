-- Migration 006: Source Lifecycle, License Registry, Output Dependencies, Parser Golden Files, Connector Quarantine
--
-- EPIC 3 — Legal Data Factory und Quellenbreite
--
-- Tables:
--   sources                  — Lifecycle-managed source registry (discovered → ... → retired)
--   source_license_reviews   — License review workflow with human approval
--   output_dependencies      — Output → Claim → Source Snapshot dependency graph
--   parser_golden_files      — Schema-drift detection fixtures
--   connector_quarantine     — Quarantined items from connectors

-- ============================================================
-- sources: Lifecycle-Managed Source Registry
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id              TEXT PRIMARY KEY,                          -- "law-de", "law-at-judikatur", "law-eu"
  name            TEXT NOT NULL,
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('DE', 'AT', 'CH', 'EU', 'MULTI')),
  source_type     TEXT NOT NULL CHECK (source_type IN (
    'primary_legislation',    -- Gesetze im engeren Sinne
    'regulation',             -- Verordnungen
    'case_law_supreme',       -- Höchstgerichtliche Judikatur (BGH, OGH, BGer)
    'case_law_instance',      -- Instanzrechtsprechung (OLG, LG, etc.)
    'materials',              -- Gesetzesmaterialien (Begründungen, Drucksachen)
    'authority_practice',     -- Behördenpraxis (Verwaltungspraxis, Erlasse)
    'literature_open',        -- Offene Literatur (Open Access)
    'literature_licensed'     -- Lizenzierte Literatur (Verlagspartnerschaft)
  )),
  lifecycle_state TEXT NOT NULL DEFAULT 'discovered' CHECK (lifecycle_state IN (
    'discovered',
    'rights_pending',
    'parser_pending',
    'eval_pending',
    'early_access',
    'general_availability',
    'degraded',
    'retired'
  )),
  config          JSONB NOT NULL DEFAULT '{}',               -- connector config, fetch params
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by     TEXT,                                      -- user ID who approved rights
  approved_at     TIMESTAMPTZ,
  retired_at      TIMESTAMPTZ,
  retired_reason  TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,        -- extensible: coverage info, notes

  -- Lifecycle timestamps for audit trail
  rights_cleared_at   TIMESTAMPTZ,
  parser_ready_at     TIMESTAMPTZ,
  eval_passed_at      TIMESTAMPTZ,
  early_access_at     TIMESTAMPTZ,
  ga_at               TIMESTAMPTZ,
  degraded_at         TIMESTAMPTZ,

  CHECK (
    (lifecycle_state = 'discovered') OR
    (lifecycle_state != 'discovered' AND approved_by IS NOT NULL)
  )
);

-- Index for filtering by lifecycle state
CREATE INDEX IF NOT EXISTS idx_sources_lifecycle
  ON sources (lifecycle_state);

-- Index for filtering by jurisdiction
CREATE INDEX IF NOT EXISTS idx_sources_jurisdiction
  ON sources (jurisdiction);

-- Index for filtering by source type
CREATE INDEX IF NOT EXISTS idx_sources_type
  ON sources (source_type);

-- ============================================================
-- source_license_reviews: License Review Workflow
-- ============================================================
CREATE TABLE IF NOT EXISTS source_license_reviews (
  id              BIGSERIAL PRIMARY KEY,
  source_id       TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  reviewer_id     TEXT NOT NULL,                             -- user ID
  reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  license_type    TEXT NOT NULL CHECK (license_type IN (
    'public',           -- Gesetz im öffentlichen Interesse, frei nutzbar
    'open',             -- Open Data License (CC-BY, CC0, ODbL)
    'commercial',       -- Kommerzielle Lizenz (Verlagspartnerschaft)
    'restricted',       -- Eingeschränkte Nutzung (nur Forschung, nur intern)
    'pending'           -- Noch nicht geklärt
  )),
  terms_url       TEXT,                                     -- URL zu Nutzungsbedingungen
  scraping_allowed BOOLEAN NOT NULL DEFAULT false,           -- Scraping erlaubt?
  api_usage_allowed BOOLEAN NOT NULL DEFAULT false,          -- API-Nutzung erlaubt?
  attribution_required BOOLEAN NOT NULL DEFAULT false,       -- Quellenangabe erforderlich?
  commercial_use_allowed BOOLEAN NOT NULL DEFAULT false,     -- Kommerzielle Nutzung erlaubt?
  notes           TEXT,
  approved        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_license_reviews_source
  ON source_license_reviews (source_id);

CREATE INDEX IF NOT EXISTS idx_license_reviews_approved
  ON source_license_reviews (source_id) WHERE approved = true;

-- ============================================================
-- output_dependencies: Output → Claim → Source Snapshot Graph
-- ============================================================
CREATE TABLE IF NOT EXISTS output_dependencies (
  id              BIGSERIAL PRIMARY KEY,
  output_id       TEXT NOT NULL,                             -- pipeline run ID, draft slug, etc.
  output_type     TEXT NOT NULL,                             -- "draft", "memo", "schriftsatz", "fristenreport", "copilot_answer"
  claim_hash      TEXT,                                      -- SHA-256 of the specific claim text (nullable for whole-output deps)
  source_slug     TEXT NOT NULL,                             -- "law/de/bgb"
  snapshot_hash   TEXT NOT NULL,                             -- content_hash of the corpus snapshot used
  paragraph_ref   TEXT,                                      -- "823", "823 Abs. 1" (if known)
  brain_id        TEXT,                                      -- tenant context
  user_id         TEXT,                                      -- user who triggered the output
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Re-verification tracking
  reverify_status TEXT NOT NULL DEFAULT 'pending' CHECK (reverify_status IN (
    'pending',       -- amendment detected, needs re-verification
    'verified',      -- re-verified, still correct
    'stale',         -- re-verified, no longer correct
    'failed',        -- re-verification failed (error)
    'not_affected'   -- amendment did not affect this specific claim
  )),
  reverified_at   TIMESTAMPTZ,
  reverified_by   TEXT,
  reverify_notes  TEXT,

  -- Link to the amendment that triggered re-verification
  triggering_amendment_id BIGINT REFERENCES corpus_amendments(id),

  -- Prevent duplicate dependency records
  UNIQUE (output_id, source_slug, paragraph_ref, snapshot_hash)
);

CREATE INDEX IF NOT EXISTS idx_output_deps_output
  ON output_dependencies (output_id);

CREATE INDEX IF NOT EXISTS idx_output_deps_source
  ON output_dependencies (source_slug, snapshot_hash);

CREATE INDEX IF NOT EXISTS idx_output_deps_reverify
  ON output_dependencies (reverify_status) WHERE reverify_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_output_deps_brain
  ON output_dependencies (brain_id) WHERE brain_id IS NOT NULL;

-- ============================================================
-- parser_golden_files: Schema-Drift Detection
-- ============================================================
CREATE TABLE IF NOT EXISTS parser_golden_files (
  id              BIGSERIAL PRIMARY KEY,
  source_id       TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  parser_version  TEXT NOT NULL,                             -- e.g. "ris-ogd-v2.6", "gesetze-im-internet-v1"
  fixture_name    TEXT NOT NULL,                             -- e.g. "bgb_823.html"
  fixture_hash    TEXT NOT NULL,                             -- SHA-256 of input fixture
  expected_output_hash TEXT NOT NULL,                        -- SHA-256 of expected parsed output
  expected_paragraph_count INTEGER,                          -- sanity check
  expected_metadata JSONB NOT NULL DEFAULT '{}',             -- expected frontmatter/metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at    TIMESTAMPTZ,                               -- last successful validation
  validation_error TEXT,                                     -- last error if validation failed

  UNIQUE (source_id, fixture_name, parser_version)
);

CREATE INDEX IF NOT EXISTS idx_golden_files_source
  ON parser_golden_files (source_id);

CREATE INDEX IF NOT EXISTS idx_golden_files_parser
  ON parser_golden_files (source_id, parser_version);

-- ============================================================
-- connector_quarantine: Quarantined Items
-- ============================================================
CREATE TABLE IF NOT EXISTS connector_quarantine (
  id              BIGSERIAL PRIMARY KEY,
  source_id       TEXT NOT NULL,                             -- source/connector ID
  item_id         TEXT NOT NULL,                             -- external item ID (e.g. RIS document ID)
  item_url        TEXT,                                      -- original URL
  reason          TEXT NOT NULL CHECK (reason IN (
    'parse_error',           -- parser failed to extract content
    'schema_drift',          -- structure changed from golden file
    'hash_mismatch',         -- content hash changed unexpectedly
    'rate_limited',          -- rate limit hit, deferred
    'auth_failed',           -- authentication failed
    'content_empty',         -- fetched content was empty
    'content_too_large',     -- exceeded size limit
    'encoding_error',        -- encoding/umlaut issues
    'manual_quarantine'      -- manually quarantined by admin
  )),
  error_detail    TEXT,                                      -- detailed error message
  item_metadata   JSONB NOT NULL DEFAULT '{}',               -- captured metadata for debugging
  quarantined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at     TIMESTAMPTZ,                               -- when released from quarantine
  released_by     TEXT,                                      -- user who released it
  release_reason  TEXT,                                      -- why it was released

  -- Prevent duplicate quarantine entries for same item
  UNIQUE (source_id, item_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_quarantine_source
  ON connector_quarantine (source_id);

CREATE INDEX IF NOT EXISTS idx_quarantine_unreleased
  ON connector_quarantine (source_id) WHERE released_at IS NULL;
