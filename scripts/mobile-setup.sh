#!/usr/bin/env bash
set -euo pipefail

# Subsumio Mobile Setup — erzeugt native iOS/Android Projekte und installiert Plugins.
# Voraussetzungen: Node 20+, Xcode 15+ (iOS), Android Studio (Android).
# Siehe mobile/README.md für Details.

echo "=== Subsumio Mobile Setup ==="

# 1. Dependencies installieren
echo "[1/5] Installiere Dependencies…"
bun install

# 2. Native Projekte generieren (falls noch nicht vorhanden)
if [ ! -d "ios" ]; then
  echo "[2/5] Generiere iOS-Projekt…"
  npx cap add ios
else
  echo "[2/5] iOS-Projekt bereits vorhanden."
fi

if [ ! -d "android" ]; then
  echo "[3/5] Generiere Android-Projekt…"
  npx cap add android
else
  echo "[3/5] Android-Projekt bereits vorhanden."
fi

# 4. Plugins synchronisieren
echo "[4/5] Synchronisiere Plugins…"
npx cap sync

# 5. App-Icons & Splash generieren (falls Source-Icon vorhanden)
if [ -f "public/icon-192.png" ]; then
  echo "[5/5] Generiere App-Icons & Splash Screens…"
  npx capacitor-assets generate \
    --iconBackgroundColor '#06060f' \
    --splashBackgroundColor '#06060f' \
    2>/dev/null || echo "  (capacitor-assets nicht installiert — überspringe)"
else
  echo "[5/5] Kein public/icon-192.png gefunden — überspringe Icon-Generierung."
fi

echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "Nächste Schritte:"
echo "  iOS:     npx cap open ios      → Xcode: Gerät wählen → Run"
echo "  Android: npx cap open android  → Android Studio: Gerät wählen → Run"
echo ""
echo "Für Dev-Server-Tests:"
echo "  CAP_SERVER_URL=http://<dein-lan-ip>:3000 npx cap sync"
echo ""
echo "Store-Submission:"
echo "  Siehe mobile/README.md — Checkliste für App Store + Google Play"
