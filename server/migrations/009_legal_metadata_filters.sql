-- v0.48 — Legal metadata filter indexes
--
-- Expression indexes on frontmatter jsonb fields used by
-- buildLegalMetadataClause() for filtering court decisions by
-- court, legal_area, and decision date range.
--
-- These support the SQL predicates:
--   LOWER(frontmatter->>'court') = $N
--   LOWER(frontmatter->>'legal_area') = $N
--   frontmatter->>'date' >= $N
--   frontmatter->>'date' <= $N
--
-- The GIN index on frontmatter (idx_pages_frontmatter) supports
-- containment checks (@>) but not text extraction/comparison.
-- These expression indexes bridge that gap for filtered search.

-- Court filter (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_pages_frontmatter_court
  ON pages (LOWER(frontmatter->>'court'))
  WHERE deleted_at IS NULL;

-- Legal area filter (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_pages_frontmatter_legal_area
  ON pages (LOWER(frontmatter->>'legal_area'))
  WHERE deleted_at IS NULL;

-- Decision date filter (text comparison works for ISO dates YYYY-MM-DD)
CREATE INDEX IF NOT EXISTS idx_pages_frontmatter_date
  ON pages ((frontmatter->>'date'))
  WHERE deleted_at IS NULL
    AND frontmatter->>'date' IS NOT NULL;
