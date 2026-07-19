#!/bin/bash
# Backfill source_id in content_chunks in small batches
# Usage: ssh subsumio-hetzner "bash -s" < scripts/backfill-source-id.sh

BATCH_SIZE=2000
TOTAL=2087403
DONE=26441
REMAINING=$((TOTAL - DONE))

echo "Starting backfill: $REMAINING rows remaining, batch_size=$BATCH_SIZE"

while [ $REMAINING -gt 0 ]; do
  RESULT=$(echo "
    SET synchronous_commit = 'off';
    SET statement_timeout = '30s';
    WITH batch AS (
      SELECT cc.id, p.source_id 
      FROM content_chunks cc 
      JOIN pages p ON cc.page_id = p.id 
      WHERE cc.source_id IS NULL 
      ORDER BY cc.id 
      LIMIT $BATCH_SIZE
    )
    UPDATE content_chunks 
    SET source_id = batch.source_id 
    FROM batch 
    WHERE content_chunks.id = batch.id;
  " | docker exec -i subsumio-engine-db-1 psql -U sigmabrain -d sigmabrain -t 2>&1)
  
  UPDATED=$(echo "$RESULT" | grep -oP 'UPDATE \K\d+' || echo "0")
  
  if [ "$UPDATED" = "0" ]; then
    echo "Batch failed or 0 rows: $RESULT"
    sleep 2
    # Try smaller batch
    BATCH_SIZE=500
    continue
  fi
  
  DONE=$((DONE + UPDATED))
  REMAINING=$((TOTAL - DONE))
  PCT=$((DONE * 100 / TOTAL))
  echo "Updated $UPDATED rows | Total: $DONE/$TOTAL ($PCT%) | Remaining: $REMAINING"
  
  # Adaptive batch size
  if [ $UPDATED -eq $BATCH_SIZE ] && [ $BATCH_SIZE -lt 5000 ]; then
    BATCH_SIZE=$((BATCH_SIZE + 500))
  fi
done

echo "Backfill complete!"
