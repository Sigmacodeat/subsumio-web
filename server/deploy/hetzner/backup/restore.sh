#!/bin/sh
# Disaster-recovery RESTORE runbook (as a script). Restores a snapshot's DB dump
# into a target database and surfaces where the original files landed.
#
# Run inside the `backup` container (has restic + pg tools):
#   docker compose run --rm \
#     -e TARGET_DATABASE_URL='postgres://subsumio:PASS@db:5432/subsumio' \
#     backup /backup/restore.sh [snapshot-id]
#
# NEVER restore blind over the live DB during an incident drill — restore into a
# fresh/staging database first, verify, then cut over.
set -eu

snap=${1:-latest}
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL (postgres connection string)}"

rdir="/tmp/restore-$(date -u +%s)"
echo "[restore] restoring snapshot '${snap}' → ${rdir}"
restic restore "${snap}" --target "${rdir}"

dump=$(find "${rdir}" -name '*.dump' | head -1)
[ -n "${dump}" ] || { echo "[restore] ERROR: no .dump in snapshot"; exit 1; }

echo "[restore] pg_restore ${dump} → ${TARGET_DATABASE_URL}"
pg_restore --clean --if-exists --no-owner -d "${TARGET_DATABASE_URL}" "${dump}"

if [ -d "${rdir}/data" ]; then
  echo "[restore] original files restored to ${rdir}/data"
  echo "[restore] → copy them onto the engine-data volume (/data) of the engine container:"
  echo "[restore]   docker cp ${rdir}/data/. <engine-container>:/data/"
fi

echo "[restore] DONE. Now: start the stack, log in, open a client document, measure RTO."
