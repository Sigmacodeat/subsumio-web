#!/bin/sh
# Daily backup of everything a firm would lose: the database without the public
# law corpus (dump-firm-data.sh) plus the original files. Encrypted, with
# retention, and a status file the health check reads.
#
# Two destinations, independent of each other:
#   offsite  restic repo (RESTIC_REPOSITORY) — the real backup.
#   local    encrypted archive in BACKUP_LOCAL_DIR — better than nothing, and
#            the only one that exists until the offsite repo is configured.
# A run with neither destination fails loudly instead of pretending to work.
#
# Env (set by the compose `backup` service from .env):
#   RESTIC_REPOSITORY, RESTIC_PASSWORD       — restic repo + encryption key
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY — for s3: repos (S3-compatible storage)
#   BACKUP_LOCAL_DIR, BACKUP_LOCAL_PASSPHRASE — local encrypted copy
#   BACKUP_LOCAL_KEEP_DAYS                   — local retention (default 14)
#   BACKUP_LOCAL_INCLUDE_FILES               — 1 (default): the local archive also
#                                              holds the original files (/data)
#   BACKUP_FILES_DIR                         — original files (default /data)
#   BACKUP_STATUS_FILE                       — written on success, read by /api/cron/health:
#                                              {"at","offsite","files"} — the health
#                                              check reports "ok" only with an offsite
#                                              copy that includes the original files.
#   PGHOST/PGUSER/PGPASSWORD/PGDATABASE      — Postgres connection
#   RESEND_API_KEY/MAIL_FROM/QUEUE_ALERT_EMAIL — alert channel (optional)
set -eu
# A failing command inside a pipe (psql \copy | gzip, tar | openssl) must fail
# the run; without pipefail the last command's 0 hides it. busybox ash has it.
set -o pipefail
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

trap 'alert "Backup-Lauf fehlgeschlagen (run.sh, exit $?). Siehe Container-Logs."' EXIT

ts=$(date -u +%Y%m%dT%H%M%SZ)
echo "[backup] ${ts} starting"

if [ -z "${RESTIC_REPOSITORY:-}" ] && [ -z "${BACKUP_LOCAL_DIR:-}" ]; then
  alert "Weder Offsite-Repo noch lokales Verzeichnis konfiguriert — es gibt KEIN Backup."
  exit 1
fi

work="/tmp/firm-${ts}"
files_dir="${BACKUP_FILES_DIR:-/data}"
offsite=false
# Where the original files (uploads, scans, briefs) ended up in this run:
# offsite | local | none | not_mounted (files live in object storage).
files=none
[ -d "$files_dir" ] || files=not_mounted
OUT_DIR="$work" sh "$(dirname "$0")/dump-firm-data.sh"
# Web app state (file-backed stores, WhatsApp media) goes into the same
# snapshot, so both the offsite repo and the local archive carry it.
if [ -d /web-data ]; then
  cp -a /web-data "$work/web-data"
fi

if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  restic cat config >/dev/null 2>&1 || restic init
  # Back up /data (original files) only when it is mounted — i.e. STORAGE_BACKEND=local.
  set -- "$work"
  [ -d "$files_dir" ] && set -- "$@" "$files_dir"
  restic backup --tag subsumio --host subsumio-prod "$@"
  restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
  restic check --read-data-subset=5%
  offsite=true
  [ -d "$files_dir" ] && files=offsite
  echo "[backup] offsite ok"
else
  echo "[backup] WARNUNG: kein Offsite-Repo (BACKUP_RESTIC_REPOSITORY) — nur lokale Kopie auf demselben Server."
  alert "Kein Offsite-Backup konfiguriert — nur lokale Kopie auf demselben Server."
fi

if [ -n "${BACKUP_LOCAL_DIR:-}" ]; then
  [ -n "${BACKUP_LOCAL_PASSPHRASE:-}" ] || {
    alert "BACKUP_LOCAL_DIR gesetzt, aber BACKUP_LOCAL_PASSPHRASE fehlt — Mandantendaten dürfen nicht unverschlüsselt liegen."
    exit 1
  }
  mkdir -p "$BACKUP_LOCAL_DIR"
  archive="$BACKUP_LOCAL_DIR/subsumio-${ts}.tar.gz.enc"
  # Original files go into the local archive too (unless switched off), so a
  # lost volume does not take the firms' documents with it.
  set -- -C "$(dirname "$work")" "$(basename "$work")"
  if [ "${BACKUP_LOCAL_INCLUDE_FILES:-1}" = "1" ] && [ -d "$files_dir" ]; then
    set -- "$@" -C "$(dirname "$files_dir")" "$(basename "$files_dir")"
    [ "$files" = "offsite" ] || files=local
  fi
  tar -czf - "$@" |
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_LOCAL_PASSPHRASE \
      -out "$archive"
  echo "[backup] lokal: $archive ($(du -h "$archive" | cut -f1))"
  keep="${BACKUP_LOCAL_KEEP_DAYS:-14}"
  find "$BACKUP_LOCAL_DIR" -name 'subsumio-*.tar.gz.enc' -mtime "+${keep}" -delete
fi

rm -rf "$work"

if [ -n "${BACKUP_STATUS_FILE:-}" ]; then
  mkdir -p "$(dirname "$BACKUP_STATUS_FILE")"
  printf '{"at":"%s","offsite":%s,"files":"%s"}\n' "$(date -u +%FT%TZ)" "$offsite" "$files" \
    >"$BACKUP_STATUS_FILE"
fi

trap - EXIT
echo "[backup] $(date -u +%FT%TZ) done"
