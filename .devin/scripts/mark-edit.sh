#!/usr/bin/env bash
# mark-edit.sh — PostToolUse-Hook für edit/write.
# Toucht .devin/.last-edit, damit der Stop-Hook erkennt, dass seit dem
# letzten /dod-gate-Pass Code geändert wurde.
#
# Input: JSON auf stdin (Hook-Event-Daten). Wir ignorieren den Inhalt —
# jeder edit/write-Call setzt den Marker.
# Output: keiner (exit 0 = Hook continues normally).

set -euo pipefail

# DEVIN_PROJECT_DIR wird vom Hook-System gesetzt; Fallback auf cwd.
PROJECT_DIR="${DEVIN_PROJECT_DIR:-$(pwd)}"
MARKER="$PROJECT_DIR/.devin/.last-edit"

# stdin konsumieren (Hook-Daten), sonst kann der Pipe blockieren.
cat >/dev/null 2>&1 || true

mkdir -p "$PROJECT_DIR/.devin"
touch "$MARKER"

exit 0
