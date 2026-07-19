-- Backfill source_id in content_chunks
-- Run as single connection: psql -f backfill-source-id.sql
SET synchronous_commit = 'off';
SET statement_timeout = '0';
SET work_mem = '256MB';

DO $$
DECLARE
  batch_count integer := 0;
  total_updated integer := 0;
  batch_updated integer;
BEGIN
  LOOP
    -- Use a CTE to select and update in one statement
    -- This avoids the row-locking issue of separate SELECT+UPDATE
    WITH batch AS (
      SELECT cc.id, p.source_id
      FROM content_chunks cc
      JOIN pages p ON cc.page_id = p.id
      WHERE cc.source_id IS NULL
      ORDER BY cc.id
      LIMIT 5000
      FOR UPDATE SKIP LOCKED
    )
    UPDATE content_chunks
    SET source_id = batch.source_id
    FROM batch
    WHERE content_chunks.id = batch.id;
    
    GET DIAGNOSTICS batch_updated = ROW_COUNT;
    total_updated := total_updated + batch_updated;
    batch_count := batch_count + 1;
    
    -- Exit when no more rows
    EXIT WHEN batch_updated = 0;
    
    -- Progress every 10 batches
    IF batch_count % 10 = 0 THEN
      RAISE NOTICE 'Batch %: updated % rows (total: %)', batch_count, batch_updated, total_updated;
    END IF;
    
    -- Small delay to let DB breathe
    PERFORM pg_sleep(0.01);
  END LOOP;
  
  RAISE NOTICE 'Done! Total batches: %, total rows updated: %', batch_count, total_updated;
END $$;
