#!/usr/bin/env bash
# require-dod-gate.sh — Stop-Hook.
# Blockiert den Turn-Ende, wenn seit dem letzten /dod-gate-Pass Code
# editiert wurde (PostToolUse-Hook hat .last-edit toucht; /dod-gate toucht
# .dod-gate-passed).
#
# Loop-Schutz: wenn stop_hook_active=true (Hook schon einmal aktiv), erlaube
# Stop — verhindert Endlos-Schleife laut Hook-Doku-Warnung.
#
# Input: JSON auf stdin mit { stop_hook_active: bool, ... }.
# Output: bei Block: JSON auf stdout + exit 2. Sonst exit 0.

set -euo pipefail

PROJECT_DIR="${DEVIN_PROJECT_DIR:-$(pwd)}"
LAST_EDIT="$PROJECT_DIR/.devin/.last-edit"
GATE_PASSED="$PROJECT_DIR/.devin/.dod-gate-passed"

# stdin lesen (Hook-Event-Daten).
INPUT="$(cat 2>/dev/null || true)"

# stop_hook_active parsen (einfaches grep, keine jq-Abhängigkeit).
if echo "$INPUT" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' 2>/dev/null; then
  # Loop-Schutz aktiv — Stop erlauben, keine Endlos-Schleife.
  exit 0
fi

# Kein Edit-Marker → nie Code geändert in diesem Turn → Stop erlauben
# (reiner Chat, Frage, etc.).
if [ ! -f "$LAST_EDIT" ]; then
  exit 0
fi

# Gate-Pass-Marker fehlt → Code geändert aber Gate nie durchlaufen → blocken.
if [ ! -f "$GATE_PASSED" ]; then
  printf '{"decision":"block","reason":"Code wurde seit Session-Start geändert, aber /dod-gate wurde noch nicht durchlaufen. Rufe /dod-gate auf und bestätige jedes Item, bevor du den Turn beendest."}\n'
  exit 2
fi

# Beide Marker vorhanden → vergleiche Timestamps.
# last-edit NEUER als gate-passed → Code nach Gate geändert → blocken.
if [ "$LAST_EDIT" -nt "$GATE_PASSED" ]; then
  printf '{"decision":"block","reason":"Code wurde seit dem letzten /dod-gate-Pass geändert. Rufe /dod-gate erneut auf und bestätige jedes Item, bevor du den Turn beendest."}\n'
  exit 2
fi

# gate-passed NEUER als last-edit → Gate nach letztem Edit durchlaufen → OK.
exit 0
