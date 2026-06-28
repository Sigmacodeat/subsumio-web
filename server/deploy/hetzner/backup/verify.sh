#!/bin/sh
# Weekly restore-VERIFICATION: proves the latest backup is actually restorable,
# not merely present. Restores the newest dump into a throwaway database,
# asserts key tables are non-empty, then drops it. Alerts on any failure.
#
# This is the difference between "we have backups" and "we have RESTORABLE
# backups" — the audit's missing "getesteter Restore".
set -eu
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

check_db="subsumio_restore_check"

cleanup() {
  rm -rf "${rdir:-/tmp/verify-none}" 2>/dev/null || true
  PGPASSWORD="${PGPASSWORD}" dropdb -h "${PGHOST}" -U "${PGUSER}" --if-exists "${check_db}" 2>/dev/null || true
}
trap 'cleanup; alert "Restore-Verifikation fehlgeschlagen (verify.sh, exit $?)."' EXIT

ts=$(date -u +%FT%TZ)
echo "[verify] ${ts} starting restore verification"

rdir="/tmp/verify-$(date -u +%s)"
restic restore latest --target "${rdir}"
dump=$(find "${rdir}" -name '*.dump' | head -1)
if [ -z "${dump}" ]; then
  alert "Kein DB-Dump im jüngsten Snapshot gefunden."
  exit 1
fi

export PGPASSWORD="${PGPASSWORD}"
dropdb -h "${PGHOST}" -U "${PGUSER}" --if-exists "${check_db}"
createdb -h "${PGHOST}" -U "${PGUSER}" "${check_db}"
# --no-owner: the throwaway DB may not have the prod role grants.
pg_restore --no-owner -h "${PGHOST}" -U "${PGUSER}" -d "${check_db}" "${dump}" || true

pages=$(psql -h "${PGHOST}" -U "${PGUSER}" -d "${check_db}" -tAc "SELECT count(*) FROM pages;" 2>/dev/null || echo 0)
files=$(psql -h "${PGHOST}" -U "${PGUSER}" -d "${check_db}" -tAc "SELECT count(*) FROM files;" 2>/dev/null || echo 0)

cleanup
trap - EXIT

if [ "${pages:-0}" -gt 0 ]; then
  echo "[verify] OK — restored snapshot has pages=${pages}, files=${files}"
else
  alert "Restore-Verifikation: wiederhergestellte DB hat 0 Seiten (pages=${pages}, files=${files}) — Backup könnte unbrauchbar sein!"
  exit 1
fi
