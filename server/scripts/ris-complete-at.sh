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
#   3. consolidated state law as XML (missing or rejected)
#   4. full decision texts of OGH, VfGH, VwGH (only Rechtssätze were on disk)
#   5. missing decisions per court, largest gaps first
# The corpus pipeline normalizes and imports whatever lands on disk.
set -u
cd /app || exit 1
LOG=/root/subsumio-pipeline-logs/ris-complete-at.log
STATE=/law-corpus/_state
mkdir -p "$STATE"

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
# the validator rejected.
step bun scripts/fetch-at-landesrecht-xml.ts --keep-xml /law-corpus/_xml/at-landesrecht

# Full decision texts of the supreme courts: OGH (plus OLG/LG in "Justiz"),
# VfGH, VwGH. The corpus held their Rechtssätze but almost no decisions.
step bun scripts/fetch-entscheidungstexte.ts --court ogh,vfgh,vwgh

for court in bvwg vwgh ogh lvwg dok vfgh gbk umse uvs dsk asylgh pvak ubas; do
  step bun scripts/fetch-all-at-judikatur.ts --court "$court" --from 1900
done

# Decision → norm links for everything that arrived. Idempotent; run again
# after the pipeline has imported the new files.
step bun scripts/build-citation-links.ts --apply

# Measure again after everything arrived.
step bun scripts/reconcile-ris.ts

echo "=== $(date -u +%FT%TZ) RIS_COMPLETE_DONE" >> "$LOG"
