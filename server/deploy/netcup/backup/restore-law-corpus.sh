#!/bin/sh
# Loads a dump made by dump-law-corpus.sh into an EXISTING database whose
# schema already exists — run restore-firm-data.sh first; that creates the
# `pages` and `content_chunks` tables (empty) via its schema restore and
# fills them with the firm's own rows. This script adds the law rows next
# to them, into the same tables.
#
#   PGDATABASE=subsumio_restore_check IN_DIR=/opt/backup/2026-09-21 ./restore-law-corpus.sh
#
# Column lists are explicit and must match dump-law-corpus.sh's SELECT
# exactly: the dump has neither `embedding` nor `embedding_qwen` (see that
# script for why), and \copy with an explicit list leaves omitted columns at
# their table default — NULL for the vectors, which is the truth: nothing
# has been embedded yet in the restored database.
set -eu

IN_DIR="${IN_DIR:?set IN_DIR}"
DB="${PGDATABASE:?set PGDATABASE}"

load() {
  name="$1"
  cols="$2"
  file="$IN_DIR/$name.csv.gz"
  [ -f "$file" ] || {
    echo "[restore] $file fehlt" >&2
    exit 1
  }
  echo "[restore]     $name"
  gzip -dc "$file" | psql -v ON_ERROR_STOP=1 -q -d "$DB" \
    -c "\\copy $name ($cols) FROM STDIN WITH (FORMAT csv, HEADER true)"
  psql -v ON_ERROR_STOP=1 -qAt -d "$DB" -c "
    SELECT setval(seq, COALESCE((SELECT max(id) FROM $name), 1))
    FROM pg_get_serial_sequence('$name', 'id') seq WHERE seq IS NOT NULL" >/dev/null
}

echo "[restore] 1/2 pages (Rechtskorpus)"
load pages "id, source_id, slug, type, page_kind, title, frontmatter, compiled_truth,
  content_hash, body_hash, ecli, effective_date, effective_date_source,
  created_at, updated_at"

# Chunks reference pages — must load second.
echo "[restore] 2/2 content_chunks (Rechtskorpus)"
load content_chunks "id, page_id, chunk_index, chunk_text, chunk_source, model,
  token_count, embedded_at, language, document_type, statute_abbr,
  paragraph_ref, absatz, ziffer, literal, chunk_role, court,
  case_number, ecli, decision_date, legal_area, canonical_label, source_id"

echo "[restore] fertig. Ohne Vektoren — vor der ersten Suche neu einbetten"
echo "[restore] (server/scripts/auto-embed-pg.ts oder embed-into-column.ts)."
