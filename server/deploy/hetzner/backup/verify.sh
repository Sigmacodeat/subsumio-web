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
  # Guard the only recursive cleanup: this script may remove exclusively its
  # own timestamped verification directory, never an arbitrary environment
  # path when setup failed before rdir was assigned.
  case "${rdir:-}" in
    /tmp/verify-*) rm -rf "${rdir}" 2>/dev/null || true ;;
  esac
  PGPASSWORD="${PGPASSWORD:-}" dropdb -h "${PGHOST}" -U "${PGUSER}" --if-exists "${check_db}" 2>/dev/null || true
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
# --no-owner: the throwaway DB may not have the prod role grants. A restore
# error is fatal: accepting a partial restore defeats the purpose of this
# weekly recoverability proof.
pg_restore --exit-on-error --no-owner -h "${PGHOST}" -U "${PGUSER}" -d "${check_db}" "${dump}"

pages=$(psql -h "${PGHOST}" -U "${PGUSER}" -d "${check_db}" -tAc "SELECT count(*) FROM pages;" 2>/dev/null || echo 0)
files=$(psql -h "${PGHOST}" -U "${PGUSER}" -d "${check_db}" -tAc "SELECT count(*) FROM files;" 2>/dev/null || echo 0)
restored_files=$(find "${rdir}/data" -type f 2>/dev/null | wc -l | tr -d ' ')

# The production compose setup stores originals on engine-data and includes
# that volume in restic. A database with file records but no recovered files
# is not a usable legal-file restore, even if pages themselves are present.
if [ "${files:-0}" -gt 0 ] && [ "${restored_files:-0}" -eq 0 ]; then
  alert "Restore-Verifikation: DB enthält ${files} Dateireferenzen, aber kein Original im wiederhergestellten /data-Volume."
  exit 1
fi

cleanup
trap - EXIT

if [ "${pages:-0}" -gt 0 ]; then
  echo "[verify] OK — restored snapshot has pages=${pages}, files=${files}, original_files=${restored_files}"
else
  alert "Restore-Verifikation: wiederhergestellte DB hat 0 Seiten (pages=${pages}, files=${files}) — Backup könnte unbrauchbar sein!"
  exit 1
fi
