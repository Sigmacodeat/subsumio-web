#!/bin/sh
# One-time move of the legal corpus out of the git checkout.
#
# Since law-corpus/ is no longer tracked in git, a `git pull` in /opt/subsumio
# deletes the previously tracked corpus files from /opt/subsumio/law-corpus.
# Run this script BEFORE pulling that version. It copies the corpus to a data
# directory outside the repository (never deletes anything) and verifies the
# copy. docker-compose.yml mounts LAW_CORPUS_HOST_DIR afterwards.
#
# Usage:  sh move-corpus-out-of-repo.sh [/opt/subsumio/law-corpus] [/opt/subsumio-data/law-corpus]
set -eu

src="${1:-/opt/subsumio/law-corpus}"
dst="${2:-/opt/subsumio-data/law-corpus}"

if [ ! -d "$src" ]; then
  echo "[corpus-move] Quelle $src existiert nicht — nichts zu tun." >&2
  exit 0
fi
case "$dst" in
  /opt/subsumio/*)
    echo "[corpus-move] ABBRUCH: Ziel $dst liegt im Git-Checkout." >&2
    exit 1
    ;;
esac
if ! command -v rsync >/dev/null 2>&1; then
  echo "[corpus-move] ABBRUCH: rsync fehlt (apt-get install -y rsync)." >&2
  exit 1
fi

mkdir -p "$dst"
echo "[corpus-move] Kopiere $src/ -> $dst/ (ohne Löschen am Ziel) …"
rsync -a "$src/" "$dst/"

src_count="$(find "$src" -type f | wc -l | tr -d ' ')"
missing="$(rsync -a --dry-run --ignore-existing --out-format='%n' "$src/" "$dst/" | grep -vc '/$' || true)"
dst_count="$(find "$dst" -type f | wc -l | tr -d ' ')"
echo "[corpus-move] Dateien Quelle: $src_count · Ziel: $dst_count · fehlend am Ziel: $missing"
if [ "$missing" != "0" ]; then
  echo "[corpus-move] FEHLER: Kopie unvollständig. NICHT git pull ausführen." >&2
  exit 1
fi

cat <<EOF
[corpus-move] OK. Nächste Schritte:
  1. In server/deploy/hetzner/.env setzen:  LAW_CORPUS_HOST_DIR=$dst
  2. cd /opt/subsumio && git pull
  3. cd server/deploy/hetzner && ./preflight.sh .env && docker compose up -d --build
  Die Quelle $src bleibt unverändert liegen und kann nach erfolgreichem Betrieb entfernt werden.
EOF
