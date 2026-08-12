#!/usr/bin/env bash
#
# Unbeaufsichtigter Dauerlauf für ris-xml-fetch-normen.ts.
#
# Der RIS-Dokumentserver (www.ris.bka.gv.at) drosselt undokumentiert: eine zu
# schnelle Serie führt zu HTTP 503 für den gesamten Host, für etwa 15–20 Minuten.
# Das Fetch-Skript bricht bei anhaltenden 503 mit Exit-Code 2 ab, statt weiter
# dagegen zu laufen. Dieser Wrapper wartet die Sperre ab und setzt fort —
# bereits geholte Normen werden übersprungen.
#
#   nohup bash server/scripts/ris-xml-fetch-loop.sh > /tmp/ris-fetch-loop.log 2>&1 &
#
set -uo pipefail

RIS_FILE="${RIS_FILE:-/tmp/ris-inforce.jsonl}"
COOLDOWN="${COOLDOWN:-1800}"      # Wartezeit nach Drosselung (Sekunden)
CONCURRENCY="${CONCURRENCY:-2}"
THROTTLE_MS="${THROTTLE_MS:-500}"
MAX_RUNS="${MAX_RUNS:-60}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$REPO_DIR" || exit 1

for ((run = 1; run <= MAX_RUNS; run++)); do
  echo "=== Durchlauf $run — $(date '+%Y-%m-%d %H:%M:%S')"
  bun run server/scripts/ris-xml-fetch-normen.ts \
    --ris "$RIS_FILE" \
    --concurrency "$CONCURRENCY" \
    --throttle-ms "$THROTTLE_MS"
  code=$?

  if [ $code -eq 0 ]; then
    echo "=== Fertig nach $run Durchläufen — $(date '+%Y-%m-%d %H:%M:%S')"
    exit 0
  fi

  if [ $code -eq 2 ]; then
    echo "=== Gedrosselt. Warte ${COOLDOWN}s vor Durchlauf $((run + 1))."
    sleep "$COOLDOWN"
    continue
  fi

  echo "=== Unerwarteter Exit-Code $code — Abbruch."
  exit $code
done

echo "=== MAX_RUNS ($MAX_RUNS) erreicht, noch nicht vollständig."
exit 1
