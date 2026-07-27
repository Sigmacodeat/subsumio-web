-- ════════════════════════════════════════════════════════════════════════════
-- Verification Queries — Run BEFORE and AFTER P0 fixes
--
-- Usage (read-only, safe to run anytime):
--   ssh hetzner-web-1 -- psql -U sigmabrain -d sigmabrain -f /tmp/verify-db-state.sql
--
-- Or pipe via SSH:
--   cat server/scripts/verify-db-state.sql | ssh hetzner -- psql -U sigmabrain -d sigmabrain
-- ════════════════════════════════════════════════════════════════════════════

\echo '═══════════════════════════════════════════════════════════════'
\echo '  Subsumio DB State Verification — 2026-07-20'
\echo '═══════════════════════════════════════════════════════════════'

-- ── 1. Overall DB size ───────────────────────────────────────────
\echo '\n=== 1. Database Size ==='
SELECT pg_size_pretty(pg_database_size('sigmabrain')) AS db_size;

-- ── 2. Page counts by source ─────────────────────────────────────
\echo '\n=== 2. Pages by Source ==='
SELECT source_id, count(*) AS pages
FROM pages
WHERE deleted_at IS NULL
GROUP BY source_id
ORDER BY pages DESC;

-- ── 3. Chunk + embedding coverage ────────────────────────────────
\echo '\n=== 3. Chunk & Embedding Coverage ==='
SELECT
  count(*) AS total_chunks,
  count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded,
  count(*) FILTER (WHERE embedding IS NULL) AS missing_embeddings,
  count(*) FILTER (WHERE search_vector IS NOT NULL) AS has_search_vector,
  round(100.0 * count(*) FILTER (WHERE embedding IS NOT NULL) / count(*), 2) AS embed_pct
FROM content_chunks;

-- ── 4. Embedding model distribution ──────────────────────────────
\echo '\n=== 4. Embedding Model Distribution ==='
SELECT model, count(*) AS chunks
FROM content_chunks
WHERE embedding IS NOT NULL
GROUP BY model
ORDER BY chunks DESC;

-- ── 5. FIX 1: Broken CH slugs ────────────────────────────────────
\echo '\n=== 5. FIX 1: Broken CH-Urteil Slugs (should be 0 after fix) ==='
SELECT source_id, count(*) AS broken_slugs
FROM pages
WHERE slug ~ '^bger-'
  AND source_id LIKE 'law-ch-judikatur%'
GROUP BY source_id;

-- ── 6. FIX 2: Duplicate current versions ─────────────────────────
\echo '\n=== 6. FIX 2: Duplicate status=current (should be 0 after fix) ==='
SELECT source_id, statute_abbr, count(*) AS current_count
FROM legal_source_versions
WHERE status = 'current'
GROUP BY source_id, statute_abbr
HAVING count(*) > 1
ORDER BY current_count DESC;

-- ── 7. FIX 3: Sources without jurisdiction ───────────────────────
\echo '\n=== 7. FIX 3: Judikatur Sources Without Jurisdiction (should be 0 after fix) ==='
SELECT id, name, jurisdiction
FROM sources
WHERE id LIKE 'law-%judikatur%'
  AND jurisdiction IS NULL
ORDER BY id;

-- ── 8. All sources with jurisdiction ─────────────────────────────
\echo '\n=== 8. All Sources Overview ==='
SELECT id, name, jurisdiction, config->>'federated' AS federated
FROM sources
ORDER BY id;

-- ── 9. Disk vs DB gap (requires manual disk count) ───────────────
\echo '\n=== 9. Import Backlog Summary ==='
\echo 'Compare these DB counts with disk file counts (run on server):'
\echo '  find law-corpus/at-judikatur-vwgh -name "*.md" | wc -l'
\echo '  find law-corpus/eu -name "*.md" | wc -l'
\echo '  etc.'
SELECT source_id, count(*) AS db_pages
FROM pages
WHERE deleted_at IS NULL
  AND source_id LIKE 'law-%'
GROUP BY source_id
ORDER BY source_id;

-- ── 10. Link graph stats ─────────────────────────────────────────
\echo '\n=== 10. Citation Graph (links) ==='
SELECT link_source, count(*) AS links
FROM links
GROUP BY link_source
ORDER BY links DESC;

-- ── 11. VACUUM/ANALYZE status ────────────────────────────────────
\echo '\n=== 11. Table Bloat Check (last vacuum) ==='
SELECT
  relname AS table_name,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN ('pages', 'content_chunks', 'links', 'sources', 'legal_source_versions')
ORDER BY n_live_tup DESC;

-- ── 12. Disk space ───────────────────────────────────────────────
\echo '\n=== 12. Disk Space ==='
SELECT pg_size_pretty(pg_total_relation_size('pages')) AS pages_size,
       pg_size_pretty(pg_total_relation_size('content_chunks')) AS chunks_size,
       pg_size_pretty(pg_total_relation_size('links')) AS links_size,
       pg_size_pretty(pg_database_size('sigmabrain')) AS total_db_size;

\echo '\n═══════════════════════════════════════════════════════════════'
\echo '  Verification complete.'
\echo '═══════════════════════════════════════════════════════════════'
