#!/bin/sh
# Dumps everything a firm would lose, and nothing that can be fetched again.
#
# The database is dominated by the Austrian law corpus (public RIS data, ~75 GB,
# reproducible with the corpus fetch + import scripts). A full pg_dump needs more
# free space than the box has, which is why no backup ever ran. This dump keeps
# the schema and every table's data, but of the five corpus-heavy tables it keeps
# only the rows that belong to a firm (pages.source_id NOT LIKE 'law-%').
#
# Output (in $OUT_DIR):
#   schema-and-app-data.dump  pg_dump -Fc, corpus table DATA excluded
#   pages.csv.gz … links.csv.gz   the firm rows of the corpus-heavy tables
#   MANIFEST                  row counts + sizes, for verify.sh and restore.sh
#
# Env: PGHOST PGUSER PGPASSWORD PGDATABASE (standard libpq), OUT_DIR.
set -eu
# A failing command inside a pipe (psql \copy | gzip, tar | openssl) must fail
# the run; without pipefail the last command's 0 hides it. busybox ash has it.
set -o pipefail

OUT_DIR="${OUT_DIR:?set OUT_DIR}"
mkdir -p "$OUT_DIR"

# Tables whose rows are mostly corpus; kept only for firm pages.
FIRM_PAGES="SELECT id FROM pages WHERE source_id NOT LIKE 'law-%'"

echo "[dump] schema + app tables (corpus data excluded)"
pg_dump -Fc \
  --exclude-table-data=public.pages \
  --exclude-table-data=public.page_versions \
  --exclude-table-data=public.links \
  --exclude-table-data=public.content_chunks \
  --exclude-table-data=public.content_chunk_labels \
  -f "$OUT_DIR/schema-and-app-data.dump"

: >"$OUT_DIR/.counts"

copy_out() {
  name="$1"
  query="$2"
  echo "[dump] $name"
  psql -v ON_ERROR_STOP=1 -qAt \
    -c "\\copy ($query) TO STDOUT WITH (FORMAT csv, HEADER true)" | gzip -c >"$OUT_DIR/$name.csv.gz"
  # Count in the database: CSV text fields contain newlines, so counting lines lies.
  rows="$(psql -v ON_ERROR_STOP=1 -qAt -c "SELECT count(*) FROM ($query) s")"
  printf '%s rows=%s\n' "$name" "$rows" >>"$OUT_DIR/.counts"
}

copy_out pages "SELECT * FROM pages WHERE source_id NOT LIKE 'law-%'"
copy_out page_versions "SELECT * FROM page_versions WHERE page_id IN ($FIRM_PAGES)"
copy_out links "SELECT * FROM links WHERE from_page_id IN ($FIRM_PAGES) OR to_page_id IN ($FIRM_PAGES)"
copy_out content_chunks "SELECT * FROM content_chunks WHERE page_id IN ($FIRM_PAGES)"
copy_out content_chunk_labels "SELECT * FROM content_chunk_labels WHERE chunk_id IN (SELECT id FROM content_chunks WHERE page_id IN ($FIRM_PAGES))"

{
  echo "created_at=$(date -u +%FT%TZ)"
  echo "database=${PGDATABASE:-subsumio}"
  echo "excluded=law corpus (pages.source_id LIKE 'law-%') — refetch with server/scripts/corpus"
  while read -r line; do
    name="${line%% *}"
    printf '%s %s bytes=%s\n' "$name" "${line#* }" "$(wc -c <"$OUT_DIR/$name.csv.gz" | tr -d ' ')"
  done <"$OUT_DIR/.counts"
  printf 'schema-and-app-data.dump bytes=%s\n' "$(wc -c <"$OUT_DIR/schema-and-app-data.dump" | tr -d ' ')"
} >"$OUT_DIR/MANIFEST"

rm -f "$OUT_DIR/.counts"
echo "[dump] done: $(du -sh "$OUT_DIR" | cut -f1) in $OUT_DIR"
