#!/usr/bin/env bash
#
# Vollreparatur Bundesnormen + Landesrecht nach dem <listelem>-Fehler.
#
# WARUM VOLLABRUF STATT PRÜFUNG: `extractText()` überging in beiden Fetchern
# `<listelem>`, `<schluss>` und `<schlussteil>`. In jedem so geholten Gesetz
# fehlen damit sämtliche Aufzählungen — bei ASVG § 49 waren es 79 von 108
# Sätzen, der Text brach vor "1.Vergütungen des Dienstgebers…" ab. Ein
# Quellenabgleich über 243.477 Dokumente kostet exakt so viele Abrufe wie der
# Neuabruf; der Neuabruf repariert dabei und braucht keine Erkennungsregel,
# die wieder falsch geeicht sein kann.
#
# GEMESSENER UMFANG: Satz-Enthaltensein-Vergleich gegen die Quelle ergab
# 16 von 60 Dokumenten (26,7 %) mit fehlenden Normsätzen.
#
# --force IST ZWINGEND: beide Fetcher überspringen sonst jede vorhandene
# Datei und melden 243.477-mal "skipped", ohne eine einzige zu reparieren.
#
# --keep-xml legt das Roh-XML ab (~10 GB). Bisher wurde es im Speicher
# ausgewertet und verworfen, weshalb jede Extraktor-Korrektur einen
# stundenlangen Neuabruf erzwang. Mit abgelegtem XML ist die nächste
# Korrektur ein lokaler Lauf von Minuten.
#
#   bash server/scripts/repair-listelem-corpus.sh
#
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

INV=/tmp/ris-inforce.jsonl
XML_ROOT=law-corpus/_xml
LOG=/tmp/repair-listelem.log
: > "$LOG"
log() { echo "$(date '+%H:%M:%S') $*" | tee -a "$LOG"; }

log "═══ Schritt 1/5: Bestandsliste der geltenden Bundesnormen ═══"
if [ -s "$INV" ]; then
  log "  vorhanden: $(wc -l < "$INV" | tr -d ' ') Normen"
else
  bun run server/scripts/ris-inforce-crawl.ts --out "$INV" >> "$LOG" 2>&1
  log "  erzeugt: $(wc -l < "$INV" 2>/dev/null | tr -d ' ') Normen"
fi
[ -s "$INV" ] || { log "ABBRUCH: Bestandsliste leer"; exit 1; }

# Äußere Wiederholung: RIS hat heute nach mehreren tausend Abrufen gesperrt.
# Die Fetcher brechen bei anhaltenden Fehlern ab; der Wiedereinstieg holt nur
# noch, was fehlt — bei --force allerdings alles, deshalb wird der Fortschritt
# über die Datei-Zeitstempel gehalten und nicht über einen Zähler.
log "═══ Schritt 2/5: Bundesnormen neu abrufen ═══"
for v in 1 2 3 4 5 6; do
  bun run server/scripts/ris-xml-fetch-normen.ts --ris "$INV" \
    --force --keep-xml "$XML_ROOT/at-normen" \
    --concurrency 3 --throttle-ms 400 >> "$LOG" 2>&1
  rc=$?
  log "  Versuch $v beendet (exit $rc)"
  [ $rc -eq 0 ] && break
  log "  Pause 10 Minuten vor dem nächsten Versuch"
  sleep 600
done

log "═══ Schritt 3/5: Landesrecht neu abrufen ═══"
for v in 1 2 3 4 5 6; do
  bun run server/scripts/fetch-at-landesrecht-xml.ts \
    --force --concurrency 3 --throttle-ms 400 >> "$LOG" 2>&1
  rc=$?
  log "  Versuch $v beendet (exit $rc)"
  [ $rc -eq 0 ] && break
  log "  Pause 10 Minuten vor dem nächsten Versuch"
  sleep 600
done

log "═══ Schritt 4/5: Normalisieren ═══"
# Vollauf je Korpus — NIE mit --file-list: die Doubletten-Auswahl muss über
# den gesamten Bestand rechnen, sonst kürt sie bei fehlender bester Fassung
# eine schlechtere zum Gewinner.
for c in at-normen at-landesrecht; do
  bun server/scripts/normalize/normalize-corpus.ts --corpus "$c" --batch 500 >> "$LOG" 2>&1
  log "  $c: $(grep GESAMT "$LOG" | tail -1)"
done

log "═══ Schritt 5/5: Importieren ═══"
U=$(grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env | head -1)
export GBRAIN_ENGINE=postgres GBRAIN_DATABASE_URL="$U" DATABASE_URL="$U"
for pair in at-normen:law-at-normen at-landesrecht:law-at-landesrecht; do
  c=${pair%%:*}; s=${pair##*:}
  bun run server/scripts/batch-import-from-disk.ts --source "$s" \
    --disk-dir "law-corpus/_normalized/$c" --batch-size 200 --sleep-ms 0 \
    --no-embed --slug-from-path --force-rechunk \
    --cursor-file "/tmp/cursor-repair-$c.json" >> "$LOG" 2>&1
  log "  $s: $(grep -E 'Total imported' "$LOG" | tail -1)"
done

log "═══ FERTIG — jetzt die Nachweise fahren ═══"
log "  bun server/scripts/verify-against-ris-xml.ts --source law-at-normen --limit 200"
log "  bun server/scripts/verify-corpus-db.ts --db subsumio_law_v2"
