#!/bin/sh
# Daily offsite backup: pg_dump (the brain) + original files (local storage) →
# encrypted restic snapshot in the offsite repo. Idempotent repo init, retention
# prune, and an integrity spot-check. On ANY failure, raises an alert.
#
# Env (set by the compose `backup` service from .env):
#   RESTIC_REPOSITORY, RESTIC_PASSWORD       — restic repo + encryption key
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY — for s3: repos (Hetzner Object Storage)
#   PGHOST/PGUSER/PGPASSWORD/PGDATABASE      — Postgres connection
#   RESEND_API_KEY/MAIL_FROM/QUEUE_ALERT_EMAIL — alert channel (optional)
set -eu
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

trap 'alert "Backup-Lauf fehlgeschlagen (run.sh, exit $?). Siehe Container-Logs."' EXIT

ts=$(date -u +%Y%m%dT%H%M%SZ)
echo "[backup] ${ts} starting"

dump="/tmp/brain-${ts}.dump"
# Custom format (-Fc) = compressed + selective pg_restore.
pg_dump -Fc -f "${dump}"
echo "[backup] pg_dump ok ($(du -h "${dump}" | cut -f1))"

# Initialise the repo on first run (idempotent: skip if config already present).
restic cat config >/dev/null 2>&1 || restic init

# Always back up the DB dump. Back up /data (original files) only when it is
# mounted — i.e. STORAGE_BACKEND=local. With s3/r2 storage the originals already
# live offsite, so /data is not mounted into this container.
set -- "${dump}"
[ -d /data ] && set -- "$@" /data
restic backup --tag subsumio --host subsumio-prod "$@"

rm -f "${dump}"

# Retention: 7 daily, 4 weekly, 6 monthly. Prune unreferenced data.
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

# Cheap integrity check (5% of pack data per run; full structure always).
restic check --read-data-subset=5%

trap - EXIT
echo "[backup] $(date -u +%FT%TZ) done"
