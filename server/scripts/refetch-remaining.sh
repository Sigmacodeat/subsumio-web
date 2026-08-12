#!/bin/bash
# Refetch only the remaining broken files (~5750) across all corpora
# Sequential to respect RIS rate limit
cd /Users/msc/subsumio-web

CORPORA=(
  at-judikatur-vwgh      # 1827
  at-judikatur-bvwg      # 2392
  at-judikatur           # 1341
  at-judikatur-asylgh    # 1055
  at-judikatur-lvwg      # 780
  at                     # ~12 (after fix)
  at-judikatur-dsk       # 157
  at-judikatur-ubas      # 78
  at-judikatur-dok       # 75
  at-judikatur-uvs       # 74
  at-judikatur-vfgh      # 218
  at-gemeinden           # 40
  at-judikatur-pvak      # 7
  at-judikatur-gbk       # 6
  at-kmger               # 4
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
done

echo ""
echo "=============================================="
echo "  ALL REFETCHES DONE"
echo "=============================================="
