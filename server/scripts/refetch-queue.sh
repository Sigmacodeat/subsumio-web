#!/bin/bash
# Refetch queue — runs after BvwG finishes, processes all remaining corpora
# Usage: nohup bash server/scripts/refetch-queue.sh > /tmp/refetch-queue.log 2>&1 &

set -e
cd /Users/msc/subsumio-web

# Wait for BvwG to finish
echo "=== WAITING FOR BVWG REFETCH TO FINISH ==="
while pgrep -f "refetch-broken-files.*bvwg" > /dev/null 2>&1; do
  COUNT=$(tail -1 /tmp/refetch-bvwg.log 2>/dev/null | grep -o '\[[0-9]*/' | tr -d '[' || echo "0")
  echo "  BvwG still running: $COUNT/35722 — $(date +%H:%M)"
  sleep 300
done
echo "=== BVWG DONE — STARTING QUEUE ==="
echo ""

# Queue: sorted by broken count (largest first)
CORPORA=(
  "at-judikatur"           # 32.202 broken
  "at-judikatur-vwgh"      # 23.592 broken
  "at-landesrecht"         # 15.216 broken
  "at-judikatur-vfgh"      # 12.260 broken
  "at-bmerl"               # 1.286 broken
  "at"                     # 1.156 broken
  "at-judikatur-dsk"       # 795 broken
  "at-judikatur-lvwg"      # 780 broken
  "at-judikatur-asylgh"    # 500 broken
  "at-judikatur-dok"       # 92 broken
  "at-judikatur-uvs"       # 79 broken
  "at-judikatur-ubas"      # 46 broken
  "at-judikatur-gbk"       # 39 broken
  "at-normen"              # 25 broken
  "at-gemeinden"           # 15 broken
  "at-judikatur-pvak"      # 8 broken
  "at-judikatur-umse"      # 4 broken
  "at-literatur"           # 2 broken
  "at-avsv"                # 1 broken
)

for corpus in "${CORPORA[@]}"; do
  echo ""
  echo "=============================================="
  echo "  REFETCH: $corpus"
  echo "=============================================="
  bun run server/scripts/refetch-broken-files.ts \
    --dir "law-corpus/$corpus" \
    --rate-ms 1000 \
    2>&1
  echo "  DONE: $corpus"
done

echo ""
echo "=============================================="
echo "  ALL REFETCHES COMPLETE"
echo "=============================================="
echo ""
echo "=== FINAL VERIFICATION SCAN ==="
python3 server/scripts/scan-broken-fast.py 2>&1
