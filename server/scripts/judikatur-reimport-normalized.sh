#!/usr/bin/env bash
#
# Re-Import der Judikatur-Gerichte nach der Frontmatter-Normalisierung.
#
# Erst nach judikatur-normalize-frontmatter.ts --apply ausführen. Der Import
# schreibt die Seiten neu, damit chunkLegalDecision() greift und die
# Chunk-Metadaten (court, case_number, decision_date, ecli, chunk_role)
# gefüllt werden — bei type: "judikatur" bleiben die leer.
#
# NUR NORMALISIERTE DATEIEN: Ein Lauf über das ganze Verzeichnis verarbeitet
# auch die Dateien, die schon im Neu-Format vorlagen. Für die 5 großen Gerichte
# wären das 414.946 Dateien statt der 114.704 tatsächlich betroffenen — 72 %
# Leerlauf. Bei bvwg (45.152 von 47.257 unnötig) lief der Import dadurch auf
# über 70 Stunden hinaus. Deshalb wird je Gericht eine Dateiliste aus dem
# Marker `type_original: "judikatur"` gebaut und per --file-list übergeben.
#
#   nohup bash server/scripts/judikatur-reimport-normalized.sh > /tmp/reimport.log 2>&1 &
#
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR" || exit 1

CURSOR_DIR="${CURSOR_DIR:-/tmp/reimport-cursors}"
LIST_DIR="${LIST_DIR:-/tmp/reimport-lists}"
mkdir -p "$CURSOR_DIR" "$LIST_DIR"

# dir:sourceId — aufsteigend nach Zahl der normalisierten Dateien
COURTS=(
  "at-judikatur-asylgh:law-at-judikatur-asylgh"
  "at-judikatur-bvwg:law-at-judikatur-bvwg"
  "at-judikatur-lvwg:law-at-judikatur-lvwg"
  "at-judikatur:law-at-judikatur"
  "at-judikatur-vwgh:law-at-judikatur-vwgh"
)

for entry in "${COURTS[@]}"; do
  dir="${entry%%:*}"
  src="${entry##*:}"
  list="$LIST_DIR/$src.txt"

  # Nur Dateien, die die Normalisierung angefasst hat.
  grep -rl '^type_original: "judikatur"' "law-corpus/$dir" 2>/dev/null | sort > "$list"
  n=$(wc -l < "$list" | tr -d ' ')

  if [ "$n" -eq 0 ]; then
    echo "=== $src — nichts zu tun (0 normalisierte Dateien)"
    continue
  fi

  echo "=== $src — $n Dateien — $(date '+%F %H:%M:%S')"
  bun run server/scripts/batch-import-from-disk.ts \
    --source "$src" \
    --disk-dir "law-corpus/$dir" \
    --file-list "$list" \
    --batch-size 200 \
    --sleep-ms 10 \
    --no-embed \
    --cursor-file "$CURSOR_DIR/$src.json"
  echo "=== $src fertig (exit $?) — $(date '+%F %H:%M:%S')"
done

echo "=== ALLE GERICHTE FERTIG — $(date '+%F %H:%M:%S')"
