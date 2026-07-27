#!/bin/bash
# Incremental import loop — re-imports judikatur sources every 30 minutes
# to pick up newly backfilled files. Only files with actual text get imported
# (placeholders are auto-skipped by import-judikatur.ts).
export PGPASSWORD=2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0
cd /app

SOURCES="uvs lvwg asylgh bvwg vwgh ogh vfgh dsk gbk pvak dok"

while true; do
  echo "=== Incremental import cycle $(date) ==="
  for src in $SOURCES; do
    echo "--- Importing $src ---"
    bun scripts/import-judikatur.ts --source $src 2>&1 | tee /tmp/incremental-import-$src.log
  done
  echo "=== Cycle complete, sleeping 30 min ==="
  sleep 1800
done
