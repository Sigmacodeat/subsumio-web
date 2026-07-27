#!/bin/bash
# Import all finished AT corpus sources into local Postgres (no-embed first pass)
# Quality gates are enforced by batch-import-from-disk.ts:
#   - content_hash required
#   - no encoding artifacts
#   - no not_digitalized placeholders
#   - body must be >50 chars

set -e
cd /Users/msc/subsumio-web

SOURCES=(
  "law-at-bmerl:at-bmerl"
  "law-at-avsv:at-avsv"
  "law-at-avn:at-avn"
  "law-at-spg:at-spg"
  "law-at-kmger:at-kmger"
  "law-at-bezirke:at-bezirke"
  "law-at-gemeinden:at-gemeinden"
  "law-at-judikatur-umse:at-judikatur-umse"
  "law-at-judikatur-gbk:at-judikatur-gbk"
  "law-at-judikatur-pvak:at-judikatur-pvak"
  "law-at-judikatur-dsk:at-judikatur-dsk"
  "law-at-judikatur-dok:at-judikatur-dok"
  "law-at-judikatur-ubas:at-judikatur-ubas"
  "law-at-judikatur-vfgh:at-judikatur-vfgh"
  "law-at-judikatur-uvs:at-judikatur-uvs"
  "law-at-judikatur-asylgh:at-judikatur-asylgh"
  "law-at-judikatur-lvwg:at-judikatur-lvwg"
  "law-at:at"
  "law-at-landesrecht:at-landesrecht"
  "law-at-staatsvertraege:at-staatsvertraege"
  "law-at-literatur:at-literatur"
)

for entry in "${SOURCES[@]}"; do
  source_id="${entry%%:*}"
  disk_dir="${entry##*:}"
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  IMPORT: $source_id ← law-corpus/$disk_dir"
  echo "═══════════════════════════════════════════════════════════"
  bun run server/scripts/batch-import-from-disk.ts \
    --source "$source_id" \
    --disk-dir "law-corpus/$disk_dir" \
    --batch-size 200 --sleep-ms 10 --no-embed --max-file-size 409600 2>&1 | \
    grep -E "^(Batch|Total|Quality|IMPORT|⚠️|ERROR)" | tail -10
  echo "Done: $source_id"
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ALL SOURCES IMPORTED — now run embedding"
echo "═══════════════════════════════════════════════════════════"
