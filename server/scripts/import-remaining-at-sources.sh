#!/bin/bash
# Continue remaining AT sources after asylgh finishes.
# Waits for the running asylgh import, then runs law-at sequentially and
# the smaller remaining sources in parallel (2 at a time) while LVwG re-chunks.

cd /Users/msc/subsumio-web

echo "[import-remaining] waiting for asylgh to finish..."
while pgrep -f "batch-import-from-disk.*law-at-judikatur-asylgh" > /dev/null; do
  sleep 30
done
echo "[import-remaining] asylgh done, starting law-at + remaining"

# law-at is the biggest remaining source — run it first
bun run server/scripts/batch-import-from-disk.ts \
  --source law-at \
  --disk-dir law-corpus/at \
  --batch-size 200 --sleep-ms 10 --no-embed --max-file-size 409600 \
  > /tmp/import-law-at.log 2>&1

# smaller remaining sources can run in parallel (2 slots)
REMAINING=(
  "law-at-landesrecht:at-landesrecht"
  "law-at-staatsvertraege:at-staatsvertraege"
  "law-at-literatur:at-literatur"
)

printf "%s\n" "${REMAINING[@]}" | xargs -P 2 -I {} bash -c '
  spec="$1"
  id="${spec%%:*}"
  dir="${spec#*:}"
  log="/tmp/import-remaining-${id}.log"
  echo "== START $id ==" > "$log"
  bun run server/scripts/batch-import-from-disk.ts \
    --source "$id" \
    --disk-dir "law-corpus/$dir" \
    --batch-size 200 --sleep-ms 10 --no-embed --max-file-size 409600 >> "$log" 2>&1
  echo "== DONE $id ==" >> "$log"
' _ {}

echo ""
echo "[import-remaining] ALL REMAINING SOURCES IMPORTED"
