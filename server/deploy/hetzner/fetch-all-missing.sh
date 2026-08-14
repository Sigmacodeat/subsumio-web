#!/usr/bin/env bash
# fetch-all-missing.sh — Triggert nacheinander fetch_missing für alle
# RIS-Quellen mit Lücken, kleinste Lücke zuerst.
#
# Verwendung AUF HETZNER (im Repo-Verzeichnis, NICHT im Container):
#   cd /opt/subsumio-web/server/deploy/hetzner
#   ./fetch-all-missing.sh
#
# Voraussetzungen:
#   - Web-Service läuft (docker compose up -d web)
#   - Admin-Login-Cookie in ~/.subsumio-cookie oder via SUBSUMIO_COOKIE env
#   - Oder: SUBSUMIO_API_KEY env var (falls API-Key-Auth eingerichtet)
#
# Das Skript triggert nur — die eigentliche Arbeit macht der corpus-pipeline
# Container im Loop. Das Dashboard (Command Center) aktualisiert sich alle
# 30s automatisch und zeigt den Fortschritt.
#
# Log: /var/log/subsumio-fetch.log

set -euo pipefail

DOMAIN="${SUBSUMIO_DOMAIN:-}"
COOKIE_FILE="${SUBSUMIO_COOKIE_FILE:-$HOME/.subsumio-cookie}"
LOG_FILE="${SUBSUMIO_FETCH_LOG:-/var/log/subsumio-fetch.log}"

if [[ -z "$DOMAIN" ]]; then
  echo "❌ SUBSUMIO_DOMAIN nicht gesetzt. Beispiel:"
  echo "   export SUBSUMIO_DOMAIN=https://subsumio.example.com"
  echo "   oder setze es in .env"
  exit 1
fi

# Auth: Cookie oder API-Key
AUTH_HEADER=""
if [[ -n "${SUBSUMIO_API_KEY:-}" ]]; then
  AUTH_HEADER="Authorization: Bearer $SUBSUMIO_API_KEY"
elif [[ -f "$COOKIE_FILE" ]]; then
  AUTH_HEADER="Cookie: $(cat "$COOKIE_FILE")"
else
  echo "❌ Keine Auth gefunden. Entweder:"
  echo "   - SUBSUMIO_API_KEY env var setzen, oder"
  echo "   - Cookie in $COOKIE_FILE ablegen"
  echo ""
  echo "   Cookie holen (nach Admin-Login im Browser):"
  echo "   - DevTools > Application > Cookies > subsumio_session kopieren"
  echo "   - echo 'subsumio_session=...' > $COOKIE_FILE"
  exit 1
fi

# Quellen mit Lücken, kleinste zuerst.
# Reihenfolge bewusst: kleine Quellen zuerst, damit man schnell Fortschritt sieht.
SOURCES=(
  "law-at-judikatur-dsk"
  "law-at-judikatur-gbk"
  "law-at-judikatur-dok"
  "law-at-judikatur-pvak"
  "law-at-judikatur-uvs"
  "law-at-judikatur-ubas"
  "law-at-judikatur-umse"
  "law-at-judikatur-lvwg"
  "law-at-judikatur-asylgh"
  "law-at-judikatur-ogh"
  "law-at-judikatur-vwgh"
  "law-at-judikatur-vfgh"
  "law-at-judikatur-bvwg"
  "landesrecht"
  "statutes-at"
)

mkdir -p "$(dirname "$LOG_FILE")"

echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "[$(date -Iseconds)] Starte fetch-all-missing auf $DOMAIN" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"

TRIGGERED=0
SKIPPED=0
FAILED=0

for source_key in "${SOURCES[@]}"; do
  echo ""
  echo "[$(date -Iseconds)] Prüfe $source_key ..." | tee -a "$LOG_FILE"

  # Aktuelle Lücke abfragen (vor dem Trigger)
  PRE_STATUS=$(curl -s -H "$AUTH_HEADER" \
    "${DOMAIN}/api/admin/corpus-command-center" 2>/dev/null || echo "{}")

  # fetch_missing triggern
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    "${DOMAIN}/api/admin/corpus-command-center" \
    -d "{\"action\":\"fetch_missing\",\"source_key\":\"${source_key}\"}" 2>/dev/null || echo "error")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "  ✅ $source_key: fetch_missing getriggert" | tee -a "$LOG_FILE"
    TRIGGERED=$((TRIGGERED + 1))
    # Warte 5s zwischen Triggern, damit die Pipeline den ersten annimmt
    # bevor der nächste kommt (verhindert Trigger-Kollisionen)
    sleep 5
  elif [[ "$HTTP_CODE" == "409" ]] || echo "$BODY" | grep -q "already.*running\|läuft"; then
    echo "  ⏭️  $source_key: Pipeline läuft bereits — überspringe" | tee -a "$LOG_FILE"
    SKIPPED=$((SKIPPED + 1))
  else
    echo "  ❌ $source_key: Trigger fehlgeschlagen (HTTP $HTTP_CODE)" | tee -a "$LOG_FILE"
    echo "     Response: $BODY" | tee -a "$LOG_FILE"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "[$(date -Iseconds)] Fertig. Getriggert: $TRIGGERED | Übersprungen: $SKIPPED | Fehlgeschlagen: $FAILED" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo ""
echo "Dashboard: $DOMAIN/dashboard/admin/corpus (Command Center Tab)"
echo "Pipeline-Logs: docker compose -f /opt/subsumio-web/server/deploy/hetzner/docker-compose.yml logs -f corpus-pipeline"
echo "Fetch-Log: tail -f $LOG_FILE"
