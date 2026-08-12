#!/usr/bin/env bash
# Kanonischen Korpus parallel importieren.
#
# WARUM: Der Importer ist CPU-gebunden (ein Kern, ~72 % Auslastung) und die
# Laufzeit hängt an der Dokumentgröße, nicht an der Dateizahl. AsylGH (Ø 50 KB)
# und BvwG (Ø 98 KB) laufen mit ~2 Dateien/s, VwGH und Normen (Ø 4 KB) mit ~28.
# Sequentiell summiert sich das auf rund 20 Stunden bei 10 freien Kernen.
#
# SICHERHEIT: Jedes Korpus wird durch ein atomar angelegtes Lock-Verzeichnis
# genau einem Worker zugeteilt — zwei Prozesse können nie dieselbe Cursor-Datei
# schreiben. Der Cursor wird nach jedem Batch gespeichert; ein abgebrochener
# Lauf verliert höchstens einen Batch und wird beim nächsten Start fortgesetzt.
#
#   bash server/scripts/import-parallel.sh <ziel-db> [worker-anzahl]

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

DB="${1:-subsumio_law_v2}"
WORKERS="${2:-3}"
LOCKDIR="/tmp/import-locks-$DB"
LOGDIR="/tmp/import-logs-$DB"
mkdir -p "$LOCKDIR" "$LOGDIR"

URL=$(grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env | head -1)
TARGET=$(echo "$URL" | sed "s#/subsumio_law?#/$DB?#")
if [ -z "$TARGET" ]; then echo "Keine DB-URL gefunden."; exit 1; fi

# Reihenfolge: die teuersten Korpora zuerst. Sonst belegt am Ende ein einzelner
# 7-Stunden-Brocken die Wanduhr, während die anderen Worker leerlaufen.
CORPORA=(
  "at-judikatur-bvwg:law-at-judikatur-bvwg"
  "at-judikatur-asylgh:law-at-judikatur-asylgh"
  "at-judikatur-lvwg:law-at-judikatur-lvwg"
  "at-normen:law-at-normen"
  "at-judikatur-vwgh:law-at-judikatur-vwgh"
  "at-judikatur-uvs:law-at-judikatur-uvs"
  "at-judikatur-vfgh:law-at-judikatur-vfgh"
  "at-judikatur-ubas:law-at-judikatur-ubas"
  "at-judikatur-dok:law-at-judikatur-dok"
  "at-judikatur-pvak:law-at-judikatur-pvak"
  "at-judikatur-dsk:law-at-judikatur-dsk"
  "at-judikatur-gbk:law-at-judikatur-gbk"
  "at-judikatur-umse:law-at-judikatur-umse"
  "at-judikatur:law-at-judikatur-ogh"
  "at-gemeinden:law-at-gemeinden"
  "at-avsv:law-at-avsv"
  "at-bmerl:law-at-bmerl"
  "at-staatsvertraege:law-at-staatsvertraege"
  "at:law-at"
  "at-avn:law-at-avn"
  "at-literatur:law-at-literatur"
  "at-spg:law-at-spg"
  "at-landesrecht:law-at-landesrecht"
  "at-kmger:law-at-kmger"
)

worker() {
  local id=$1
  for entry in "${CORPORA[@]}"; do
    local dir="${entry%%:*}"
    local src="${entry##*:}"
    [ -d "law-corpus/_normalized/$dir" ] || continue

    # Atomares Zuteilen: mkdir gelingt genau einem Worker.
    mkdir "$LOCKDIR/$dir" 2>/dev/null || continue

    echo "[worker $id] ▶ $src"
    bun run server/scripts/batch-import-from-disk.ts \
      --source "$src" \
      --disk-dir "law-corpus/_normalized/$dir" \
      --batch-size 200 --sleep-ms 0 \
      --no-embed --slug-from-path --force-rechunk \
      --cursor-file "/tmp/import-cursor-$DB-$src.json" \
      > "$LOGDIR/$src.log" 2>&1
    local rc=$?
    if [ $rc -eq 0 ]; then
      echo "[worker $id] ✓ $src"
      touch "$LOCKDIR/$dir/.done"
    else
      echo "[worker $id] ✗ $src (exit $rc) — siehe $LOGDIR/$src.log"
    fi
  done
  echo "[worker $id] fertig"
}

export GBRAIN_ENGINE=postgres
export GBRAIN_DATABASE_URL="$TARGET"
export DATABASE_URL="$TARGET"

echo "Ziel-DB:  $DB"
echo "Worker:   $WORKERS"
echo "Logs:     $LOGDIR"
echo "Start:    $(date '+%H:%M:%S')"
echo "────────────────────────────────────────────────"

for i in $(seq 1 "$WORKERS"); do
  worker "$i" &
done
wait

echo "────────────────────────────────────────────────"
echo "Alle Worker fertig: $(date '+%H:%M:%S')"
