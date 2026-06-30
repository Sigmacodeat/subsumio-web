#!/usr/bin/env bash
#
# Live-Smoke-Test gegen die echte Hetzner-Produktion.
#
# Ersetzt die Mock-basierte tests/e2e-workflow-simulation.ts (die immer grün ist,
# weil sie nur API-Vertragsformen gegen ein In-Memory-Mock prüft). Dieser Test
# trifft die echte Engine + Web-App und fängt genau die Defekte, die der Mock nie
# sah: toter LLM-Key, heading-only-Korpus, gebrochene Auth-Gates.
#
# Usage:
#   SMOKE_EMAIL=demo.agent@subsum.io SMOKE_PASSWORD=*** bash tests/live-smoke.sh
#
# Optionale Env:
#   SMOKE_BASE_URL   (default https://subsum.io)
#   SMOKE_ENGINE_URL (default https://api.subsum.io)
#
# Exit 0 = alle Checks grün, sonst Anzahl der Fehlschläge.

set -uo pipefail

BASE="${SMOKE_BASE_URL:-https://subsum.io}"
ENGINE="${SMOKE_ENGINE_URL:-https://api.subsum.io}"
EMAIL="${SMOKE_EMAIL:-}"
PASS="${SMOKE_PASSWORD:-}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

G='\033[32m'; R='\033[31m'; Y='\033[33m'; B='\033[1m'; N='\033[0m'
PASS_N=0; FAIL_N=0
ok(){   printf "  ${G}✓${N} %s\n" "$1"; PASS_N=$((PASS_N+1)); }
bad(){  printf "  ${R}✗${N} %s\n" "$1"; FAIL_N=$((FAIL_N+1)); }
note(){ printf "  ${Y}•${N} %s\n" "$1"; }

req(){ curl -s -m 20 -b "$JAR" -c "$JAR" "$@"; }

printf "${B}Subsumio Live-Smoke — %s / %s${N}\n\n" "$BASE" "$ENGINE"

# 1) Engine-Health
printf "${B}1) Engine${N}\n"
H="$(curl -s -m 15 "$ENGINE/health")"
echo "$H" | grep -q '"status":"ok"' && ok "Engine health 200 (${H})" || bad "Engine health nicht ok: $H"

# 2) Auth-Gates (unauth)
printf "${B}2) Auth-Gates${N}\n"
[ "$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE/api/auth/me")" = "401" ] \
  && ok "/api/auth/me ohne Session → 401" || bad "/api/auth/me liefert nicht 401"
[ "$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE/dashboard")" = "307" ] \
  && ok "/dashboard ohne Session → 307 (Login-Redirect)" || bad "/dashboard nicht hinter Auth"

# 3) Login
printf "${B}3) Login${N}\n"
if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
  note "SMOKE_EMAIL/SMOKE_PASSWORD nicht gesetzt — überspringe authentifizierte Checks"
else
  LOGIN="$(req -H 'Content-Type: application/json' -H "Origin: $BASE" -X POST "$BASE/api/auth/login" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")"
  echo "$LOGIN" | grep -q '"email"' && ok "Login erfolgreich" || { bad "Login fehlgeschlagen: ${LOGIN:0:120}"; }
  req -o /dev/null "$BASE/dashboard"
  CSRF="$(grep -i sb_csrf "$JAR" | awk '{print $NF}')"

  # 4) Korpus-Suche
  printf "${B}4) Korpus-Suche${N}\n"
  S="$(req "$BASE/api/search?q=Mietvertrag")"
  echo "$S" | grep -q '"slug"' && ok "Suche liefert echte Treffer" || bad "Suche leer/fehlerhaft"

  # 5) LLM lebt (think darf NICHT 'no LLM available' sagen)
  printf "${B}5) AI / LLM${N}\n"
  T="$(curl -s -m 60 -N -b "$JAR" -H 'Content-Type: application/json' -H "x-csrf-token: $CSRF" -H "Origin: $BASE" \
        -X POST "$BASE/api/think" -d '{"query":"Nenne in einem Satz die Verjährungsnorm für Gewährleistung im ABGB.","mode":"conservative"}')"
  if echo "$T" | grep -qi "no LLM available"; then
    bad "LLM NICHT konfiguriert auf der Engine ('no LLM available')"
  elif echo "$T" | grep -q '"chunk"'; then
    ok "LLM liefert synthetisierte Antwort"
    echo "$T" | grep -q '"citations":\[{' && ok "Antwort enthält Citations" || note "keine Citations in dieser Antwort"
  else
    bad "Unerwartete think-Antwort: ${T:0:120}"
  fi

  # 6) Korpus-Integrität (heading-only-Regress)
  printf "${B}6) Korpus-Integrität (Volltext statt nur Überschrift)${N}\n"
  check_wc(){ # $1=slug  $2=label
    local enc; enc="$(printf '%s' "$1" | sed 's#/#%2F#g')"
    local w; w="$(req "$BASE/api/pages/$enc" | grep -o '"word_count":[0-9]*' | cut -d: -f2)"
    if [ -z "$w" ]; then bad "$2: Page fehlt (404)"
    elif [ "$w" -le 12 ]; then bad "$2: nur Überschrift (word_count=$w) — Re-Ingest nötig"
    else ok "$2: Volltext (word_count=$w)"; fi
  }
  check_wc "legal/statutes/at/abgb/p-933"  "AT ABGB §933"
  check_wc "legal/statutes/at/ustg/p-18"   "AT UStG §18"
  check_wc "legal/statutes/de/bgb/p-433"   "DE BGB §433"
  check_wc "legal/statutes/ch/zgb/art-1"   "CH ZGB Art.1"

  # 7) OCR (für gescannte/bildbasierte Dokumente) — informativ
  printf "${B}7) OCR (Scan-Dokumente)${N}\n"
  O="$(req "$BASE/api/ocr-status")"
  if echo "$O" | grep -q '"enabled":true'; then ok "OCR aktiv (Scans werden text-extrahiert)"
  else note "OCR inaktiv auf der Engine — gescannte Dokumente schlagen fehl (SUBSUMIO_EMBEDDING_IMAGE_OCR + Vision-Key setzen)"; fi
fi

printf "\n${B}── Ergebnis: ${G}%s grün${N}${B} / ${R}%s rot${N}${B} ──${N}\n" "$PASS_N" "$FAIL_N"
[ "$FAIL_N" -eq 0 ] || printf "${R}Smoke-Test FAIL${N} — siehe oben.\n"
exit "$FAIL_N"
