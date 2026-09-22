#!/bin/sh
# Restores a dump made by dump-firm-data.sh into an EMPTY database.
#
#   PGDATABASE=subsumio_restore_check IN_DIR=/opt/backup/2026-09-18 ./restore-firm-data.sh
#
# Three passes, because the firm's pages arrive as CSV next to the dump: tables
# first, then all data (dump data + CSV), then indexes and foreign keys. Loading
# the keys earlier fails — rows in `tags` point at pages that are not there yet.
#
# The law corpus is not part of the dump: after restoring, refetch and reimport
# it (server/scripts/corpus). A firm's matters, documents, deadlines, invoices,
# users and audit log are complete.
set -eu

IN_DIR="${IN_DIR:?set IN_DIR}"
DB="${PGDATABASE:?set PGDATABASE}"
dump="$IN_DIR/schema-and-app-data.dump"
[ -f "$dump" ] || {
  echo "[restore] $dump fehlt" >&2
  exit 1
}

echo "[restore] 1/3 Tabellen anlegen"
pg_restore --no-owner --no-privileges --section=pre-data -d "$DB" "$dump"

echo "[restore] 2/3 Daten einspielen"
pg_restore --no-owner --no-privileges --section=data -d "$DB" "$dump"

# Order matters: chunks reference pages, labels reference chunks.
for name in pages content_chunks content_chunk_labels page_versions links; do
  file="$IN_DIR/$name.csv.gz"
  [ -f "$file" ] || continue
  echo "[restore]     $name"
  gzip -dc "$file" | psql -v ON_ERROR_STOP=1 -q -d "$DB" \
    -c "\\copy $name FROM STDIN WITH (FORMAT csv, HEADER true)"
  # The rows carry their original ids; move the sequence past them.
  psql -v ON_ERROR_STOP=1 -qAt -d "$DB" -c "
    SELECT setval(seq, COALESCE((SELECT max(id) FROM $name), 1))
    FROM pg_get_serial_sequence('$name', 'id') seq WHERE seq IS NOT NULL" >/dev/null
done

echo "[restore] 3/3 Indizes und Fremdschlüssel"
pg_restore --no-owner --no-privileges --section=post-data -d "$DB" "$dump"

echo "[restore] fertig. Rechtskorpus separat neu importieren."
