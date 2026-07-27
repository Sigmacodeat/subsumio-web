#!/bin/bash
# EU Regulations Batch Import Loop — robust version with logging
# Runs import-eu-corpus.ts in 10k batches, embedding after each batch.
set -u

LOG=/root/subsumio-pipeline-logs/eu-batch-loop.log
BATCH_SIZE=10000
TOTAL=161043
OFFSET=10000  # Batch 1 already done

echo "=== EU Batch Loop started $(date) ===" >> "$LOG"

while [ $OFFSET -lt $TOTAL ]; do
  echo "$(date) — BATCH offset=$OFFSET limit=$BATCH_SIZE" >> "$LOG"

  bun /app/scripts/import-eu-corpus.ts --type regulation --no-embed --offset $OFFSET --limit $BATCH_SIZE >> "$LOG" 2>&1
  IMPORT_EXIT=$?
  echo "$(date) — Import exit code: $IMPORT_EXIT" >> "$LOG"

  if [ $IMPORT_EXIT -ne 0 ]; then
    echo "$(date) — Import failed, sleeping 30s before retry..." >> "$LOG"
    sleep 30
    bun /app/scripts/import-eu-corpus.ts --type regulation --no-embed --offset $OFFSET --limit $BATCH_SIZE >> "$LOG" 2>&1
    IMPORT_EXIT=$?
    echo "$(date) — Retry exit code: $IMPORT_EXIT" >> "$LOG"
  fi

  echo "$(date) — Embedding pending chunks..." >> "$LOG"
  bun /app/scripts/auto-embed-pg.ts --batch-size 100 >> "$LOG" 2>&1
  echo "$(date) — Embedding done." >> "$LOG"

  OFFSET=$((OFFSET + BATCH_SIZE))
  echo "$(date) — Sleeping 10s..." >> "$LOG"
  sleep 10
done

echo "=== EU Batch Loop COMPLETE $(date) ===" >> "$LOG"
