#!/bin/bash
# Parallel import of remaining AT corpus sources.
# Uses xargs -P 3 to run up to 3 bun batch imports concurrently.
# Each source gets its own log at /tmp/import-parallel-<source_id>.log.

cd /Users/msc/subsumio-web

SOURCES=(
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

# 3 parallel jobs keeps us under CPU/Postgres limits (10 cores, 100 max_connections)
JOBS=3

printf "%s\n" "${SOURCES[@]}" | xargs -P "$JOBS" -I {} bash -c '
  spec="$1"
  id="${spec%%:*}"
  dir="${spec#*:}"
  log="/tmp/import-parallel-${id}.log"
  echo "== START $id ==" > "$log"
  bun run server/scripts/batch-import-from-disk.ts \
    --source "$id" \
    --disk-dir "law-corpus/$dir" \
    --batch-size 200 \
    --sleep-ms 10 \
    --no-embed \
    --max-file-size 409600 >> "$log" 2>&1
  echo "== DONE $id ==" >> "$log"
' _ {}

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ALL PARALLEL SOURCES IMPORTED"
echo "═══════════════════════════════════════════════════════════"
