#!/bin/sh
# Weekly restore VERIFICATION: proves the latest backup is actually restorable,
# not merely present. Restores it into a throwaway database, asserts the firm's
# tables are populated, then drops it. Alerts on any failure.
#
# This is the difference between "we have backups" and "we have RESTORABLE
# backups". Works with the offsite repo when configured, otherwise with the
# newest local encrypted archive.
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
  dropdb -h "${PGHOST}" -U "${PGUSER}" --if-exists "${check_db}" 2>/dev/null || true
}
trap 'cleanup; alert "Restore-Verifikation fehlgeschlagen (verify.sh, exit $?)."' EXIT

echo "[verify] $(date -u +%FT%TZ) starting restore verification"
rdir="/tmp/verify-$(date -u +%s)"
mkdir -p "${rdir}"

if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  # --tag: the repo also holds subsumio-corpus snapshots (see
  # run-law-corpus.sh) since 2026-09-21. Without the filter, "latest"
  # is repo-wide and would silently restore whichever kind ran last.
  restic restore latest --tag subsumio --target "${rdir}"
elif [ -n "${BACKUP_LOCAL_DIR:-}" ]; then
  archive=$(ls -t "${BACKUP_LOCAL_DIR}"/subsumio-*.tar.gz.enc 2>/dev/null | head -1 || true)
  [ -n "${archive}" ] || {
    alert "Keine lokale Sicherung in ${BACKUP_LOCAL_DIR} gefunden."
    exit 1
  }
  echo "[verify] lokale Sicherung: ${archive}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_LOCAL_PASSPHRASE \
    -in "${archive}" | tar -C "${rdir}" -xzf -
else
  alert "Weder Offsite-Repo noch lokales Verzeichnis konfiguriert — nichts zu prüfen."
  exit 1
fi

set_dir=$(dirname "$(find "${rdir}" -name 'schema-and-app-data.dump' | head -1)")
[ -d "${set_dir}" ] || {
  alert "Kein Datenbank-Dump in der jüngsten Sicherung gefunden."
  exit 1
}

dropdb -h "${PGHOST}" -U "${PGUSER}" --if-exists "${check_db}"
createdb -h "${PGHOST}" -U "${PGUSER}" "${check_db}"
IN_DIR="${set_dir}" PGDATABASE="${check_db}" sh "$(dirname "$0")/restore-firm-data.sh"

count() {
  psql -h "${PGHOST}" -U "${PGUSER}" -d "${check_db}" -tAc "$1" 2>/dev/null || echo 0
}
pages=$(count "SELECT count(*) FROM pages")
cases=$(count "SELECT count(*) FROM pages WHERE type = 'legal_case'")
users=$(count "SELECT count(*) FROM subsumio_users")
restored_files=$(find "${rdir}/data" -type f 2>/dev/null | wc -l | tr -d ' ')

cleanup
trap - EXIT

if [ "${pages:-0}" -gt 0 ]; then
  echo "[verify] OK — pages=${pages}, Akten=${cases}, Nutzer=${users}, Originaldateien=${restored_files}"
else
  alert "Restore-Verifikation: wiederhergestellte DB hat 0 Seiten — Backup könnte unbrauchbar sein!"
  exit 1
fi
