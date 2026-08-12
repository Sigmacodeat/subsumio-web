#!/bin/bash
# Auto-Restart-Wrapper für RIS-Download
# Startet den Fetcher neu, wenn er wegen 503 abbricht.
# Wartet COOLDOWN Sekunden zwischen Versuchen.

set -e

RIS_FILE="/tmp/ris-inforce.jsonl"
DISK_DIR="/Users/msc/subsumio-web/law-corpus/at-normen"
LOG="/tmp/auto-download.log"
COOLDOWN=180  # 3 Minuten Pause bei 503
MAX_RETRIES=100

echo "═══════════════════════════════════════════════════════════" | tee "$LOG"
echo "  AUTO-DOWNLOAD RIS Normen" | tee -a "$LOG"
echo "  Start: $(date)" | tee -a "$LOG"
echo "═══════════════════════════════════════════════════════════" | tee -a "$LOG"

for i in $(seq 1 $MAX_RETRIES); do
  echo "" | tee -a "$LOG"
  echo "=== VERSUCH $i/$MAX_RETRIES — $(date) ===" | tee -a "$LOG"
  
  FILES_BEFORE=$(find "$DISK_DIR" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  echo "Dateien vor Versuch: $FILES_BEFORE" | tee -a "$LOG"
  
  cd /Users/msc/subsumio-web/server
  bun run scripts/ris-xml-fetch-normen.ts \
    --ris "$RIS_FILE" \
    --disk-dir "$DISK_DIR" \
    --concurrency 8 \
    --throttle-ms 200 \
    --max-503 30 \
    >> "$LOG" 2>&1 || true
  
  EXIT_CODE=$?
  FILES_AFTER=$(find "$DISK_DIR" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  DELTA=$((FILES_AFTER - FILES_BEFORE))
  
  echo "Versuch $i beendet. Exit: $EXIT_CODE" | tee -a "$LOG"
  echo "Dateien nach Versuch: $FILES_AFTER (Delta: $DELTA)" | tee -a "$LOG"
  
  # Prüfe ob fertig
  if grep -q "Vollständigkeit:.*✓ 1:1" "$LOG" 2>/dev/null; then
    echo "" | tee -a "$LOG"
    echo "═══════════════════════════════════════════════════════════" | tee -a "$LOG"
    echo "  DOWNLOAD KOMPLETT! $FILES_AFTER Dateien" | tee -a "$LOG"
    echo "  Ende: $(date)" | tee -a "$LOG"
    echo "═══════════════════════════════════════════════════════════" | tee -a "$LOG"
    exit 0
  fi
  
  # Wenn keine neuen Dateien geholt wurden, länger warten
  if [ "$DELTA" -eq 0 ]; then
    echo "Keine neuen Dateien — warte $COOLDOWN Sekunden..." | tee -a "$LOG"
  else
    echo "Warte $COOLDOWN Sekunden (RIS-Cooldown)..." | tee -a "$LOG"
  fi
  
  sleep $COOLDOWN
done

echo "Max retries erreicht." | tee -a "$LOG"
