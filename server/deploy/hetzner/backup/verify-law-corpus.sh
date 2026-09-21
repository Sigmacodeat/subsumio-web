#!/bin/sh
# Weekly verification that the latest law-corpus backup is intact: restores
# the snapshot, decompresses every CSV, and checks its row count against
# MANIFEST. No throwaway database needed — a gzip that decompresses cleanly
# and a row count that matches what was dumped is proof the bytes survived,
# which is what an offsite copy can actually fail at (truncated upload,
# silent corruption). Whether the CONTENT restores into a working schema is
# restore-law-corpus.sh's job, exercised by hand during an actual drill.
set -eu
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

cleanup() {
  case "${rdir:-}" in
    /tmp/verify-corpus-*) rm -rf "${rdir}" 2>/dev/null || true ;;
  esac
}
trap 'cleanup; alert "Korpus-Backup-Verifikation fehlgeschlagen (verify-law-corpus.sh, exit $?)."' EXIT

echo "[verify-corpus] $(date -u +%FT%TZ) starting"
rdir="/tmp/verify-corpus-$(date -u +%s)"
mkdir -p "${rdir}"

if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  restic restore latest --tag subsumio-corpus --target "${rdir}"
elif [ -n "${BACKUP_LOCAL_DIR:-}" ]; then
  archive=$(ls -t "${BACKUP_LOCAL_DIR}"/corpus-*.tar.gz.enc 2>/dev/null | head -1 || true)
  [ -n "${archive}" ] || {
    alert "Keine lokale Korpus-Sicherung in ${BACKUP_LOCAL_DIR} gefunden."
    exit 1
  }
  echo "[verify-corpus] lokale Sicherung: ${archive}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_LOCAL_PASSPHRASE \
    -in "${archive}" | tar -C "${rdir}" -xzf -
else
  alert "Weder Offsite-Repo noch lokales Verzeichnis konfiguriert — nichts zu prüfen."
  exit 1
fi

set_dir=$(dirname "$(find "${rdir}" -name 'MANIFEST' | head -1)")
[ -d "${set_dir}" ] || {
  alert "Korpus-Backup-Verifikation: kein MANIFEST in der jüngsten Sicherung gefunden."
  exit 1
}

fail=0
while read -r line; do
  case "$line" in
    pages\ rows=* | content_chunks\ rows=*) ;;
    *) continue ;;
  esac
  name=${line%% *}
  claimed=${line#*rows=}
  claimed=${claimed%% *}
  file="${set_dir}/${name}.csv.gz"
  [ -f "$file" ] || {
    alert "Korpus-Backup: ${file} fehlt, obwohl MANIFEST es listet."
    fail=1
    continue
  }
  # -1 for the CSV header line.
  actual=$(( $(gzip -dc "$file" | wc -l) - 1 ))
  if [ "$actual" -ne "$claimed" ]; then
    alert "Korpus-Backup: ${name} hat ${actual} Zeilen, MANIFEST verspricht ${claimed}."
    fail=1
  fi
  echo "[verify-corpus] ${name}: ${actual} Zeilen (MANIFEST: ${claimed}) OK"
done <"${set_dir}/MANIFEST"

cleanup
trap - EXIT

if [ "$fail" -eq 0 ]; then
  echo "[verify-corpus] OK — Zeilenzahlen stimmen mit MANIFEST überein."
else
  exit 1
fi
