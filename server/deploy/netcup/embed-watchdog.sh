#!/bin/bash
# Hält den Qwen-Embedding-Lauf am Leben.
#
# Die Arbeiter laufen als `docker exec` im Engine-Container und sterben mit
# ihm. Am 21.09. startete der Container um 03:02 neu (Exit 0, kein OOM) und
# nahm alle acht mit — 2,5 Stunden Stillstand, bis es jemand bemerkte.
# Dieser Wächter läuft auf dem HOST, überlebt den Neustart des Containers und
# setzt die Arbeiter neu auf, sobald keiner mehr läuft.
#
# Er endet von selbst, wenn nichts mehr einzubetten ist.
set -u
LOG=/opt/subsumio-data/qwen-watchdog.log
PSQL='docker exec -i subsumio-engine-db-1 psql -U subsumio -d subsumio -t -A'

sagen() { printf '%s  %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"; }

# Dieselbe Regel wie der Lauf selbst (core/embedding-run.ts → embeddableSql).
# Mit einer eigenen, einfacheren Regel wartete der Wächter ewig auf Chunks,
# die der Lauf mit Absicht nie einbettet, und startete im Zwei-Minuten-Takt
# Arbeiter, die nichts zu tun finden. Beim Deploy erzeugen:
#   bun -e 'import {embeddableSql} from "./src/core/embedding-run.ts"; console.log(embeddableSql("c","p"))' > embeddable.sql
REGEL_DATEI=/opt/subsumio-data/embeddable.sql
regel() { if [ -s "$REGEL_DATEI" ]; then cat "$REGEL_DATEI"; else echo "length(btrim(c.chunk_text)) >= 80"; fi; }

offen() { echo "SELECT count(*) FROM content_chunks c JOIN pages p ON p.id=c.page_id WHERE c.embedding_qwen IS NULL AND p.deleted_at IS NULL AND $(regel)" | $PSQL 2>/dev/null | tr -cd '0-9'; }
laufen() { docker exec subsumio-engine-engine-1 sh -c 'ps -eo args | grep "[e]mbed-into-column" | grep -c id-from' 2>/dev/null | head -1 | tr -cd '0-9'; }

starten() {
  sagen "Kein Arbeiter aktiv — schneide Fenster neu und starte acht."
  fenster=$(echo "WITH k AS (SELECT c.id, ntile(8) OVER (ORDER BY c.id) AS b FROM content_chunks c JOIN pages p ON p.id=c.page_id WHERE c.embedding_qwen IS NULL AND p.deleted_at IS NULL AND $(regel)) SELECT b, min(id)-1, max(id) FROM k GROUP BY b ORDER BY b" | $PSQL -F' ' 2>/dev/null)
  [ -z "$fenster" ] && { sagen "Keine Fenster erhalten — überspringe."; return; }
  echo "$fenster" | while read -r b von bis; do
    [ -z "${bis:-}" ] && continue
    # Der letzte Arbeiter bekommt keine Obergrenze, damit neu importierte
    # Chunks nicht hinten durchfallen.
    if [ "$b" = "8" ]; then grenze=""; else grenze="--id-to $bis"; fi
    docker exec -d -w /app subsumio-engine-engine-1 sh -c \
      "bun run scripts/embed-into-column.ts --column embedding_qwen --batch-size 128 --id-from $von $grenze >> /data/qwen-$b.log 2>&1"
  done
  sagen "Acht Arbeiter gestartet."
}

spalte_da() {
  $PSQL -c "SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='content_chunks' AND a.attname='embedding_qwen' AND NOT a.attisdropped" 2>/dev/null | tr -cd '0-9'
}

sagen "Wächter gestartet."
while true; do
  # Nach dem Umschalten heißt die Spalte `embedding`, und embedding_qwen gibt
  # es nicht mehr. Ein Wächter, der dann weiter Arbeiter startet, schreibt ins
  # Leere — also endet er von selbst, statt sich darauf zu verlassen, dass
  # jemand an ihn denkt.
  if [ "$(spalte_da)" != "1" ]; then
    sagen "Spalte embedding_qwen existiert nicht mehr (umgeschaltet?) — Wächter endet."
    exit 0
  fi
  rest=$(offen)
  if [ -z "$rest" ]; then sagen "Datenbank antwortet nicht."; sleep 120; continue; fi
  if [ "$rest" -eq 0 ]; then
    sagen "FERTIG — nichts mehr offen. Wächter endet."
    exit 0
  fi
  n=$(laufen); n=${n:-0}
  if [ "$n" -eq 0 ]; then
    starten
  fi
  sleep 120
done
