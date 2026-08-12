#!/usr/bin/env bash
# Normalisiert alle AT-Korpora in das kanonische Schema v1.
#
# Rein lokal — kein Netzwerkzugriff, läuft deshalb gefahrlos parallel zu einem
# laufenden RIS-Fetch. Der Validator entscheidet pro Datei; was durchfällt,
# bleibt im Rohkorpus liegen und wartet auf seinen Refetch.
#
# at-landesrecht ist bewusst NICHT dabei: dort schreibt gerade der
# XML-Fetcher. Ein Korpus, der sich unter dem Normalizer verändert, ergibt
# einen Lauf, dessen Ergebnis niemand reproduzieren kann.

set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

LOG=${1:-/tmp/normalize-all.log}
: > "$LOG"

CORPORA=(
  at-normen
  at-staatsvertraege
  at
  at-judikatur
  at-judikatur-vwgh
  at-judikatur-vfgh
  at-judikatur-lvwg
  at-judikatur-asylgh
  at-judikatur-uvs
  at-judikatur-bvwg
  at-judikatur-ubas
  at-judikatur-dok
  at-judikatur-dsk
  at-judikatur-gbk
  at-judikatur-pvak
  at-judikatur-umse
  at-gemeinden
  at-avsv
  at-avn
  at-bmerl
  at-bezirke
  at-kmger
  at-spg
  at-literatur
)

echo "=== Normalisierung Start $(date '+%Y-%m-%d %H:%M:%S') ===" | tee -a "$LOG"

for c in "${CORPORA[@]}"; do
  [ -d "law-corpus/$c" ] || { echo "SKIP $c (fehlt)" | tee -a "$LOG"; continue; }
  echo "" | tee -a "$LOG"
  echo "───── $c ─────" | tee -a "$LOG"
  bun server/scripts/normalize/normalize-corpus.ts --corpus "$c" --batch 500 >> "$LOG" 2>&1
  tail -1 "$LOG" | grep -q GESAMT && grep "GESAMT" "$LOG" | tail -1
done

echo "" | tee -a "$LOG"
echo "=== Normalisierung Ende $(date '+%Y-%m-%d %H:%M:%S') ===" | tee -a "$LOG"
