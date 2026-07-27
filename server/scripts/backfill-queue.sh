#!/bin/bash
# Sequential RIS backfill queue — runs each source one at a time
# with direct connection (no proxy needed, RIS lock not required since single process)
export PGPASSWORD=2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0
export RIS_PROXY_URLS=
cd /app

SOURCES=(
  "law-corpus/at-judikatur-uvs:uvs"
  "law-corpus/at-judikatur-lvwg:lvwg"
  "law-corpus/at-judikatur-asylgh:asylgh"
  "law-corpus/at-judikatur-bvwg:bvwg"
  "law-corpus/at-judikatur-vwgh:vwgh"
  "law-corpus/at-judikatur:ogh"
)

for entry in "${SOURCES[@]}"; do
  dir=$(echo "$entry" | cut -d: -f1)
  name=$(echo "$entry" | cut -d: -f2)
  echo "=== Starting $name ($dir) ==="
  bun scripts/backfill-corpus-text.ts --dir "$dir" --concurrency 1 2>&1 | tee "/tmp/backfill-${name}.log"
  echo "=== Finished $name ==="
done

echo "=== ALL RIS BACKFILLS DONE ==="
