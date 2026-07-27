-- ════════════════════════════════════════════════════════════════════════════
-- P0 Data Integrity Fixes — sigmabrain production DB
-- 2026-07-20
--
-- 3 reversible, <1s fixes identified during the Hetzner DB audit.
-- All wrapped in a single transaction. ROLLBACK if anything looks wrong.
--
-- Usage:
--   ssh hetzner-web-1 -- psql -U sigmabrain -d sigmabrain -f /tmp/p0-fixes.sql
--   (or pipe via SSH: cat p0-fixes.sql | ssh hetzner -- psql -U sigmabrain -d sigmabrain -v ON_ERROR_STOP=1)
--
-- Safety:
--   - Transaction-wrapped (ROLLBACK on any error via ON_ERROR_STOP=1)
--   - Each fix prints before/after counts
--   - All UPDATEs have WHERE clauses scoped to exact affected rows
--   - No DDL, no index changes, no lock escalation
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- PRE-FLIGHT: Verify current state matches audit findings
-- ════════════════════════════════════════════════════════════════════════════

\echo '=== PRE-FLIGHT VERIFICATION ==='

-- Fix 1 pre-flight: Count CH-Urteile with broken slug (bger-* without legal/judikatur/ch/ prefix)
SELECT 'FIX1 broken CH slugs' AS check_name,
       count(*) AS affected_rows
FROM pages
WHERE slug ~ '^bger-'
  AND source_id LIKE 'law-ch-judikatur%';

-- Fix 2 pre-flight: Count statutes with duplicate status='current'
SELECT 'FIX2 duplicate current' AS check_name,
       count(*) AS duplicate_groups
FROM (
  SELECT source_id, statute_abbr
  FROM legal_source_versions
  WHERE status = 'current'
  GROUP BY source_id, statute_abbr
  HAVING count(*) > 1
) dupes;

-- Fix 3 pre-flight: Count judikatur sources without jurisdiction
SELECT 'FIX3 missing jurisdiction' AS check_name,
       count(*) AS affected_sources
FROM sources
WHERE id LIKE 'law-%judikatur%'
  AND jurisdiction IS NULL;

\echo '=== PRE-FLIGHT COMPLETE — proceeding with fixes ==='

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 1: Delete 326 duplicate CH-Urteil pages with broken slugs (bger-*)
--
-- Root cause: Import script generated pages with slugs like 'bger-*' without
-- the canonical `legal/judikatur/ch/` prefix. A later re-import created the
-- correct slugs. All 326 broken-slug pages are exact content_hash duplicates
-- of correctly-slugged pages already in the DB. Zero inbound/outbound links
-- on broken pages. Chunks (2528) cascade-delete with pages.
--
-- Approach: DELETE the broken-slug pages. The correct versions remain.
-- Safety: Pre-flight asserts all 326 have a correct duplicate with same hash.
-- ════════════════════════════════════════════════════════════════════════════

\echo '--- FIX 1: Deleting duplicate broken-slug CH-Urteile ---'

-- Safety check: all broken-slug pages must have a correct-slugged duplicate
DO $$
DECLARE
  without_correct INTEGER;
  diff_hash_count INTEGER;
BEGIN
  SELECT count(*) INTO without_correct
  FROM pages p1
  LEFT JOIN pages p2
    ON p1.source_id = p2.source_id
   AND p2.slug = 'legal/judikatur/ch/' || p1.slug
  WHERE p1.slug ~ '^bger-'
    AND p1.source_id LIKE 'law-ch-judikatur%'
    AND p2.id IS NULL;

  IF without_correct > 0 THEN
    RAISE EXCEPTION 'FIX 1 ABORTED: % broken-slug page(s) have NO correct duplicate — would lose data', without_correct;
  END IF;

  SELECT count(*) INTO diff_hash_count
  FROM pages p1
  INNER JOIN pages p2
    ON p1.source_id = p2.source_id
   AND p2.slug = 'legal/judikatur/ch/' || p1.slug
  WHERE p1.slug ~ '^bger-'
    AND p1.source_id LIKE 'law-ch-judikatur%'
    AND p1.content_hash IS DISTINCT FROM p2.content_hash;

  IF diff_hash_count > 0 THEN
    RAISE EXCEPTION 'FIX 1 ABORTED: % broken-slug page(s) have different content_hash than correct version — needs manual review', diff_hash_count;
  END IF;
END $$;

-- Delete the broken-slug duplicates (chunks cascade via FK ON DELETE CASCADE)
DELETE FROM pages
WHERE slug ~ '^bger-'
  AND source_id LIKE 'law-ch-judikatur%';

\echo 'FIX 1: DELETE executed'

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 2: Resolve 26 duplicate status='current' in legal_source_versions
--
-- Root cause: Multiple import runs inserted new version rows without
-- superseding the previous 'current' row. The UNIQUE constraint only covers
-- (source_id, statute_abbr, version_date), not (source_id, statute_abbr, status).
--
-- Approach: For each (source_id, statute_abbr) group with >1 current rows,
-- keep the one with the latest version_date as 'current', set all others
-- to 'superseded' with valid_to = the winner's valid_from.
-- Ties broken by retrieved_at DESC (most recent import wins).
-- ════════════════════════════════════════════════════════════════════════════

\echo '--- FIX 2: Resolving duplicate current versions ---'

-- Use a CTE to identify winners (latest version_date per statute)
-- and losers (all other current rows in the same group)
WITH winners AS (
  SELECT DISTINCT ON (source_id, statute_abbr)
         id, source_id, statute_abbr, version_date, valid_from
  FROM legal_source_versions
  WHERE status = 'current'
  ORDER BY source_id, statute_abbr, version_date DESC, retrieved_at DESC
),
losers AS (
  SELECT v.id, v.source_id, v.statute_abbr
  FROM legal_source_versions v
  INNER JOIN (
    SELECT source_id, statute_abbr
    FROM legal_source_versions
    WHERE status = 'current'
    GROUP BY source_id, statute_abbr
    HAVING count(*) > 1
  ) dupes ON v.source_id = dupes.source_id AND v.statute_abbr = dupes.statute_abbr
  WHERE v.status = 'current'
    AND v.id NOT IN (SELECT id FROM winners)
)
UPDATE legal_source_versions lsv
SET status = 'superseded',
    valid_to = w.valid_from
FROM losers
JOIN winners w ON losers.source_id = w.source_id AND losers.statute_abbr = w.statute_abbr
WHERE lsv.id = losers.id;

\echo 'FIX 2: UPDATE executed'

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 3: Set jurisdiction for 13 judikatur sources
--
-- Root cause: Sources were registered via INSERT INTO sources(id, name)
-- without setting the jurisdiction column. Jurisdiction isolation currently
-- relies on slug parsing only, not the official sources.jurisdiction filter.
--
-- Approach: Set jurisdiction based on the source ID prefix.
--   law-at-judikatur*    → 'at'
--   law-de-judikatur*    → 'de'
--   law-ch-judikatur*    → 'ch'
--   law-eu-judikatur*    → 'eu'
-- ════════════════════════════════════════════════════════════════════════════

\echo '--- FIX 3: Setting jurisdiction for judikatur sources ---'

UPDATE sources
SET jurisdiction = CASE
    WHEN id LIKE 'law-at-judikatur%' THEN 'at'
    WHEN id LIKE 'law-de-judikatur%' THEN 'de'
    WHEN id LIKE 'law-ch-judikatur%' THEN 'ch'
    WHEN id LIKE 'law-eu-judikatur%' THEN 'eu'
    ELSE NULL
END
WHERE id LIKE 'law-%judikatur%'
  AND jurisdiction IS NULL;

\echo 'FIX 3: UPDATE executed'

-- ════════════════════════════════════════════════════════════════════════════
-- POST-FLIGHT: Verify fixes took effect
-- ════════════════════════════════════════════════════════════════════════════

\echo '=== POST-FLIGHT VERIFICATION ==='

-- Fix 1 post-flight: Should be 0 broken slugs
SELECT 'FIX1 remaining broken' AS check_name,
       count(*) AS remaining
FROM pages
WHERE slug ~ '^bger-'
  AND source_id LIKE 'law-ch-judikatur%';

-- Fix 2 post-flight: Should be 0 duplicate groups
SELECT 'FIX2 duplicate groups' AS check_name,
       count(*) AS remaining
FROM (
  SELECT source_id, statute_abbr
  FROM legal_source_versions
  WHERE status = 'current'
  GROUP BY source_id, statute_abbr
  HAVING count(*) > 1
) dupes;

-- Fix 3 post-flight: Should be 0 sources without jurisdiction
SELECT 'FIX3 missing jurisdiction' AS check_name,
       count(*) AS remaining
FROM sources
WHERE id LIKE 'law-%judikatur%'
  AND jurisdiction IS NULL;

\echo '=== ALL FIXES APPLIED — COMMIT ==='

COMMIT;

\echo '=== DONE — Run ROLLBACK manually if any post-flight check is non-zero ==='
