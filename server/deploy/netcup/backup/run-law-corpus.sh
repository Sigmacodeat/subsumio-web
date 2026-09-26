#!/bin/sh
# Weekly backup of the law corpus's text and metadata (see dump-law-corpus.sh
# for exactly what and why). Same two destinations as run.sh, own restic tag
# so `restic forget` prunes each independently and a restore never has to
# guess which snapshot is which kind of dump.
#
# Weekly, not daily: the corpus changes by import and correction, not by the
# minute, and a text-only dump is small (embeddings are what made the corpus
# too big to back up before) but still worth keeping off the daily critical
# path. Runs Saturday so it lands before Sunday's restore-verification slot.
set -eu
# A failing command inside a pipe (psql \copy | gzip, tar | openssl) must fail
# the run; without pipefail the last command's 0 hides it. busybox ash has it.
set -o pipefail
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

trap 'alert "Korpus-Backup fehlgeschlagen (run-law-corpus.sh, exit $?). Siehe Container-Logs."' EXIT

ts=$(date -u +%Y%m%dT%H%M%SZ)
echo "[corpus-backup] ${ts} starting"

if [ -z "${RESTIC_REPOSITORY:-}" ] && [ -z "${BACKUP_LOCAL_DIR:-}" ]; then
  alert "Weder Offsite-Repo noch lokales Verzeichnis konfiguriert — es gibt KEIN Korpus-Backup."
  exit 1
fi

work="/tmp/corpus-${ts}"
OUT_DIR="$work" sh "$(dirname "$0")/dump-law-corpus.sh"

if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  restic cat config >/dev/null 2>&1 || restic init
  restic backup --tag subsumio-corpus --host subsumio-prod "$work"
  # Longer retention than the daily firm backup: the corpus changes slowly,
  # so a monthly cadence still gives real recovery points, and there is no
  # value in seven near-identical weekly snapshots of a slowly-drifting corpus.
  restic forget --tag subsumio-corpus --keep-weekly 4 --keep-monthly 6 --prune
  restic check --read-data-subset=5%
  echo "[corpus-backup] offsite ok"
else
  echo "[corpus-backup] WARNUNG: kein Offsite-Repo — nur lokale Kopie."
fi

if [ -n "${BACKUP_LOCAL_DIR:-}" ]; then
  [ -n "${BACKUP_LOCAL_PASSPHRASE:-}" ] || {
    alert "BACKUP_LOCAL_DIR gesetzt, aber BACKUP_LOCAL_PASSPHRASE fehlt — Korpus-Backup darf nicht unverschlüsselt liegen."
    exit 1
  }
  mkdir -p "$BACKUP_LOCAL_DIR"
  archive="$BACKUP_LOCAL_DIR/corpus-${ts}.tar.gz.enc"
  tar -C "$(dirname "$work")" -czf - "$(basename "$work")" |
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_LOCAL_PASSPHRASE \
      -out "$archive"
  echo "[corpus-backup] lokal: $archive ($(du -h "$archive" | cut -f1))"
  # Weeks, not days: mirrors the offsite retention above.
  keep_days="${BACKUP_CORPUS_LOCAL_KEEP_DAYS:-60}"
  find "$BACKUP_LOCAL_DIR" -name 'corpus-*.tar.gz.enc' -mtime "+${keep_days}" -delete
fi

rm -rf "$work"

if [ -n "${BACKUP_CORPUS_STATUS_FILE:-}" ]; then
  mkdir -p "$(dirname "$BACKUP_CORPUS_STATUS_FILE")"
  date -u +%FT%TZ >"$BACKUP_CORPUS_STATUS_FILE"
fi

trap - EXIT
echo "[corpus-backup] $(date -u +%FT%TZ) done"
