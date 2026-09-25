#!/bin/sh
# Completes the Austrian RIS corpus, one RIS connection at a time.
#
# Runs inside the corpus-pipeline container (shares its RIS lock and the
# /law-corpus mount). Every step is resumable and only adds what is missing
# or failed the validator, so the queue can be restarted at any time:
#
#   docker exec -d subsumio-engine-corpus-pipeline-1 \
#     sh scripts/ris-complete-at.sh
#
# Log: /root/subsumio-pipeline-logs/ris-complete-at.log
#
# Order = value per RIS request:
#   1. cited norms for decisions already on disk (100 decisions per request)
#   2. inventory of all federal norms in force, then fetch missing ones as XML
#   3. consolidated state law as XML (missing or rejected), then renormalize
#      and report older versions without an end date
#   4. full decision texts of OGH, VfGH, VwGH (only Rechtssätze were on disk)
#   5. missing decisions per court, largest gaps first
# The corpus pipeline normalizes and imports whatever lands on disk.
set -u
cd /app || exit 1
LOG=/root/subsumio-pipeline-logs/ris-complete-at.log
STATE=/law-corpus/_state
mkdir -p "$STATE"

# One queue at a time. Starting it twice ran every step twice (2026-09-20:
# three copies of the norm backfill at once), which wastes RIS requests and
# fights over the RIS lock. mkdir is atomic; a lock of a dead run is cleared.
QUEUE_LOCK=/tmp/ris-complete-at.lock
if ! mkdir "$QUEUE_LOCK" 2>/dev/null; then
  if [ -f "$QUEUE_LOCK/pid" ] && kill -0 "$(cat "$QUEUE_LOCK/pid")" 2>/dev/null; then
    echo "=== $(date -u +%FT%TZ) läuft schon (PID $(cat "$QUEUE_LOCK/pid")) — Abbruch" >> "$LOG"
    exit 0
  fi
  rm -rf "$QUEUE_LOCK"
  mkdir "$QUEUE_LOCK" || exit 1
fi
echo $$ > "$QUEUE_LOCK/pid"
trap 'rm -rf "$QUEUE_LOCK"' EXIT INT TERM

step() {
  echo "=== $(date -u +%FT%TZ) $*" >> "$LOG"
  "$@" >> "$LOG" 2>&1
  echo "=== $(date -u +%FT%TZ) exit $? — $1 $2" >> "$LOG"
}

# Measure first: where do we stand against RIS? (corpus_reconciliation)
step bun scripts/reconcile-ris.ts

step bun scripts/backfill-judikatur-normen.ts \
  --court vwgh,ogh,vfgh,dok,lvwg,bvwg,dsk,umse,uvs,asylgh,gbk,pvak,ubas

step bun scripts/ris-inforce-crawl.ts --out "$STATE/ris-inforce.jsonl"
step bun scripts/ris-xml-fetch-normen.ts --ris "$STATE/ris-inforce.jsonl" \
  --keep-xml /law-corpus/_xml/at-normen

# Consolidated state law as XML; replaces the older state-folder/HTML files
# the validator rejected. The states number their laws independently, so the
# files live under <state>/gnr-<nr>/ — the move of the older gnr-<nr>/ layout
# runs first (idempotent). A complete scan also writes the inventory of state
# norms in force (_state/ris-landesrecht-inforce.jsonl).
step bun scripts/migrate-landesrecht-layout.ts --apply
# With the in-force index present, fetch only what is missing, by document
# number (the paged full scan was cut off at page ~266 on 2026-09-22 and never
# resumed). Without the index, the full scan also writes it.
if [ -f "$STATE/ris-inforce-landesrecht.jsonl" ]; then
  step bun scripts/fetch-at-landesrecht-xml.ts \
    --from-index "$STATE/ris-inforce-landesrecht.jsonl" \
    --keep-xml /law-corpus/_xml/at-landesrecht
else
  step bun scripts/fetch-at-landesrecht-xml.ts --keep-xml /law-corpus/_xml/at-landesrecht
fi

# Normalizer v4: state-qualified statute ids, readable RIS links (.html).
step bun scripts/normalize/normalize-corpus.ts --corpus at-landesrecht --batch 500
step bun scripts/normalize/normalize-corpus.ts --corpus at-normen --batch 500

# Older versions still active without an end date — report only; the dates
# are written with --apply after review.
step bun scripts/mark-superseded-versions.ts --source law-at-landesrecht
step bun scripts/mark-superseded-versions.ts --source law-at-normen

# Full decision texts of the supreme courts: OGH (plus OLG/LG in "Justiz"),
# VfGH, VwGH. The corpus held their Rechtssätze but almost no decisions.
step bun scripts/fetch-entscheidungstexte.ts --court ogh,vfgh,vwgh

# Order by what a lawyer cites, not by gap size: OGH civil and criminal first
# (every brief cites it), then VwGH, then BVwG — asylum and administrative
# appeals, a side field for most firms. The old order put the 83k OGH gap
# behind 495k documents, three weeks later.
for court in ogh vwgh bvwg lvwg dok vfgh gbk umse uvs dsk asylgh pvak ubas; do
  step bun scripts/fetch-all-at-judikatur.ts --court "$court" --from 1900
done

# Decision → norm links for everything that arrived. Idempotent; run again
# after the pipeline has imported the new files.
step bun scripts/build-citation-links.ts --apply

# Measure again after everything arrived.
step bun scripts/reconcile-ris.ts

echo "=== $(date -u +%FT%TZ) RIS_COMPLETE_DONE" >> "$LOG"
