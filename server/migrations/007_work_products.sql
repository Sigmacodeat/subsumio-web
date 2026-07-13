-- ──────────────────────────────────────────────────────────────────────
-- 007_work_products.sql — Unified Work Product Contract (E6.2.1)
--
-- A single table for all legal work products (memo, draft, fristenreport,
-- vertragsreview, redline, schriftsatz) with a deterministic status machine,
-- receipt reference, and claim-evidence graph reference.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subsumio_work_products (
  id              TEXT PRIMARY KEY,               -- UUID v4
  product_type    TEXT NOT NULL,                  -- memo, draft, fristenreport, vertragsreview, redline, schriftsatz
  case_slug       TEXT NOT NULL,                  -- reference to the case
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft, in_review, approved, rejected, published
  content         TEXT,                           -- the actual document content (markdown)
  content_hash    TEXT,                           -- SHA-256 of content

  -- Links to verification artifacts
  receipt_id      TEXT,                           -- FK to subsumio_work_product_receipts.receipt_id
  claim_evidence_slug TEXT,                       -- reference to claim-evidence graph page slug

  -- Tenant scoping
  brain_id        TEXT NOT NULL,
  user_id         TEXT,                           -- user who triggered generation
  jurisdiction    TEXT,                           -- 'at', 'de', 'ch', 'eu'

  -- Status machine metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ,                    -- when moved to in_review
  approved_at     TIMESTAMPTZ,                    -- when moved to approved
  approved_by     TEXT,                           -- user who approved
  published_at    TIMESTAMPTZ,                    -- when moved to published
  rejected_at     TIMESTAMPTZ,                    -- when moved to rejected
  rejected_by     TEXT,                           -- user who rejected
  rejection_reason TEXT,

  -- Extensible metadata (models, prompt hashes, etc.)
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT wp_status_check CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'published')),
  CONSTRAINT wp_type_check CHECK (product_type IN ('memo', 'draft', 'fristenreport', 'vertragsreview', 'redline', 'schriftsatz'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wp_case ON subsumio_work_products(case_slug);
CREATE INDEX IF NOT EXISTS idx_wp_brain ON subsumio_work_products(brain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wp_brain_status ON subsumio_work_products(brain_id, status);
CREATE INDEX IF NOT EXISTS idx_wp_brain_type ON subsumio_work_products(brain_id, product_type);
CREATE INDEX IF NOT EXISTS idx_wp_receipt ON subsumio_work_products(receipt_id);
