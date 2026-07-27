-- halfvec Migration Script
-- Run AFTER HNSW index rebuild (Item 4) completes.
-- This script is idempotent — safe to re-run if interrupted.
--
-- Expected savings: ~50% on embedding storage (12GB → 6GB)
-- Recall impact: <1% (float16 precision is sufficient for cosine similarity)

-- Step 1: Add halfvec column
ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS embedding_half halfvec(1536);

-- Step 2: Backfill in batches of 10K (avoids lock contention)
-- Run this in a loop until 0 rows updated
-- Each batch: UPDATE content_chunks SET embedding_half = embedding::halfvec(1536)
--   WHERE id IN (SELECT id FROM content_chunks WHERE embedding_half IS NULL AND embedding IS NOT NULL LIMIT 10000);
-- For initial run, do a single large batch:
UPDATE content_chunks
SET embedding_half = embedding::halfvec(1536)
WHERE embedding_half IS NULL AND embedding IS NOT NULL
  AND id <= (SELECT min(id) + 100000 FROM content_chunks);

-- Step 3: Build HNSW index on halfvec column (after backfill completes)
-- CREATE INDEX CONCURRENTLY idx_chunks_embedding_half_hnsw
--   ON content_chunks USING hnsw (embedding_half halfvec_cosine_ops)
--   WITH (m = 32, ef_construction = 128);

-- Step 4: Update gbrain config to use halfvec column
-- UPDATE config SET value = 'halfvec' WHERE key = 'embedding_type';
-- Or set in ~/.gbrain/config.json:
--   "embedding_columns": { "embedding": { "type": "halfvec", "dimensions": 1536, "provider": "openrouter:openai/text-embedding-3-small" } }

-- Step 5: Drop old vector HNSW index (after verifying halfvec works)
-- DROP INDEX CONCURRENTLY idx_chunks_embedding_hnsw;

-- Step 6: Eventually drop embedding column (after validation period)
-- ALTER TABLE content_chunks DROP COLUMN embedding;
