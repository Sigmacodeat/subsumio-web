#!/usr/bin/env bash
#
# Nachführung: neu geholte Rohdateien kanonisch normalisieren und importieren.
#
# WOZU: Ein Refetch schreibt in den Rohkorpus. Solange die Datei nicht durch
# `normalize-corpus.ts` gelaufen und importiert ist, steht in der Datenbank
# weiter die alte Fassung — und ein Import des unveränderten `_normalized`-
# Baums schreibt sie sogar aktiv zurück. Genau das ist am 2026-08-04
# passiert: ein Refetch hatte um 18:46 die vollständige Fassung von
# `landesrecht/gnr-20000502/anl-1` geholt (2.161 statt 1.226 Byte, mit den
# 13 fehlenden Mindestsätzen), während ein parallel laufender Import den
# `_normalized`-Stand von 15:19 einspielte. Die Reparatur wäre stillschweigend
# rückgängig gemacht worden.
#
# WIE ERKANNT: Eine Rohdatei gilt als nachzuführen, wenn sie NEUER ist als
# ihre normalisierte Entsprechung — oder wenn diese fehlt UND die Rohdatei
# nach dem letzten Normalisierungslauf des Korpus entstanden ist.
#
# Die zweite Bedingung ist nötig, weil eine fehlende normalisierte Fassung
# meist KEIN Rückstand ist: der Normalizer überspringt Doubletten bewusst
# (bei at-judikatur 30.908 von 86.559) und weist defekte Dateien ab. Eine
# frühere Fassung dieses Skripts zählte all das als "nachzuführen" und kam
# auf 128.391 Dateien statt der tatsächlichen paar hundert — at-judikatur
# allein 31.332 statt 46.
#
# SCHUTZ: Der Lauf verweigert den Start, solange ein Refetch aktiv ist.
# Andernfalls friert er den halben Stand eines noch laufenden Abrufs ein.
#
#   bash server/scripts/sync-refetched.sh --dry-run
#   bash server/scripts/sync-refetched.sh
#   bash server/scripts/sync-refetched.sh --warten     # wartet auf Refetch-Ende
#
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

DRY=0; WARTEN=0
for a in "$@"; do
  [ "$a" = "--dry-run" ] && DRY=1
  [ "$a" = "--warten" ] && WARTEN=1
done

URL=$(grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env | head -1)
[ -z "$URL" ] && { echo "Keine DB-URL in server/.env"; exit 1; }

aktive_refetches() {
  pgrep -f "refetch-broken-files|refetch-pdf-artifacts|refetch-from-list|ris-xml-fetch-normen|fetch-at-landesrecht-xml|fetch-ris-pdf-corpus" 2>/dev/null | wc -l | tr -d ' '
}

n=$(aktive_refetches)
if [ "$n" != "0" ]; then
  if [ "$WARTEN" = "1" ]; then
    echo "Warte auf $n laufende(n) Refetch …"
    while [ "$(aktive_refetches)" != "0" ]; do sleep 60; done
    echo "Refetches beendet — 60 s Nachlauf für offene Schreibvorgänge"
    sleep 60
  else
    echo "ABBRUCH: $n Refetch-Prozess(e) laufen noch."
    echo "Ein Import währenddessen friert einen halben Abrufstand ein."
    echo "Mit --warten startet der Lauf automatisch nach deren Ende."
    exit 1
  fi
fi

echo "═══════════════════════════════════════════════════════════"
echo "  Nachführung  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"

LISTE=/tmp/sync-refetched-$$
mkdir -p "$LISTE"
gesamt=0

# ── 1. Veraltete Dateien je Korpus sammeln ───────────────────────────────
for roh in law-corpus/at law-corpus/at-*; do
  c=$(basename "$roh")
  case "$c" in _*|at-pruef|at-transparenz) continue ;; esac
  [ -d "$roh" ] || continue
  norm="law-corpus/_normalized/$c"

  # Zeitmarke des letzten Normalisierungslaufs: die neueste Datei im
  # normalisierten Baum. Alles, was danach in den Rohkorpus geschrieben wurde,
  # hat dieser Lauf nicht gesehen.
  marke=""
  if [ -d "$norm" ]; then
    marke=$(find "$norm" -name '*.md' -newermt '1970-01-01' -print0 2>/dev/null \
      | xargs -0 stat -f '%m %N' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
  fi

  find "$roh" -name '*.md' -print0 2>/dev/null | while IFS= read -r -d '' f; do
    rel=${f#"$roh"/}
    n="$norm/$rel"
    if [ -f "$n" ]; then
      # Beide vorhanden → allein der Zeitstempel entscheidet.
      [ "$f" -nt "$n" ] && echo "$f"
    elif [ -n "$marke" ] && [ "$f" -nt "$marke" ]; then
      # Keine normalisierte Fassung, aber NACH dem letzten Lauf geschrieben:
      # neu geholt. Fehlt die Marke (Korpus nie normalisiert), zählt alles.
      echo "$f"
    elif [ -z "$marke" ]; then
      echo "$f"
    fi
  done > "$LISTE/$c.txt"

  k=$(wc -l < "$LISTE/$c.txt" | tr -d ' ')
  if [ "$k" = "0" ]; then rm -f "$LISTE/$c.txt"; continue; fi
  printf "  %-24s %6s nachzuführen\n" "$c" "$k"
  gesamt=$((gesamt + k))
done

echo "───────────────────────────────────────────────────────────"
echo "  gesamt: $gesamt Dateien"
if [ "$gesamt" = "0" ]; then echo "  Nichts zu tun."; rm -rf "$LISTE"; exit 0; fi
if [ "$DRY" = "1" ]; then echo "  DRY-RUN — nichts geschrieben."; rm -rf "$LISTE"; exit 0; fi

# ── 2. Kanonisch normalisieren ───────────────────────────────────────────
# NUR über normalize-corpus.ts. `normalize-refetched.ts` nutzt das kanonische
# Schema nicht und hat eine eigene, abweichende Frontmatter-Erzeugung — daraus
# entstanden 32.147 roh importierte Seiten mit falschen Datumsformaten und
# wieder aufgetauchten GNR-Platzhaltern.
echo ""
echo "─── Normalisierung ───"
for f in "$LISTE"/*.txt; do
  c=$(basename "$f" .txt)
  bun server/scripts/normalize/normalize-corpus.ts --corpus "$c" --file-list "$f" --batch 500 2>&1 \
    | grep -E "GESAMT" | sed "s|^|  $c: |"
done

# ── 3. Importieren ───────────────────────────────────────────────────────
echo ""
echo "─── Import ───"
export GBRAIN_ENGINE=postgres GBRAIN_DATABASE_URL="$URL" DATABASE_URL="$URL"
for f in "$LISTE"/*.txt; do
  c=$(basename "$f" .txt)
  case "$c" in
    at) s=law-at ;;
    at-judikatur) s=law-at-judikatur-ogh ;;
    *) s="law-${c}" ;;
  esac
  [ -d "law-corpus/_normalized/$c" ] || continue
  bun run server/scripts/batch-import-from-disk.ts --source "$s" \
    --disk-dir "law-corpus/_normalized/$c" --batch-size 200 --sleep-ms 0 \
    --no-embed --slug-from-path --force-rechunk \
    --cursor-file "/tmp/cursor-sync-$c.json" 2>&1 \
    | grep -E "Total imported|Total errors|Quality failures" | sed "s|^|  $s: |"
done

rm -rf "$LISTE"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Fertig $(date '+%H:%M:%S') — jetzt die Abnahme fahren:"
echo "  bun server/scripts/verify-corpus-db.ts --db subsumio_law_v2"
echo "═══════════════════════════════════════════════════════════"
