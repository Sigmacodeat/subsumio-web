#!/bin/sh
# Dumps the Austrian law corpus's TEXT AND METADATA — never the vectors.
#
# dump-firm-data.sh excludes every law-% page on purpose: at the time it was
# written the corpus was "reproducible with the corpus fetch + import
# scripts" and too big for the box. Neither is still quite true. RIS itself
# does not guarantee an old Fassung stays fetchable forever, and a re-fetch
# would throw away real work already done in this database: the RIS-index
# metadata sync, the region/title backfills, the whitespace repairs — hours
# of corrections that live only here, not in RIS.
#
# What is NOT in this dump, deliberately: `embedding` and `embedding_qwen`.
# A vector is a deterministic function of chunk_text plus a model that costs
# a few cents per million tokens to run again; backing it up would roughly
# double this dump's size to protect something an afternoon and ~$25
# recreates. Restoring this dump gives back a fully readable, fully
# citable, fully searchable-by-keyword corpus; only semantic search needs a
# re-embed run afterward.
#
# Output (in $OUT_DIR):
#   pages.csv.gz           every live page whose source_id LIKE 'law-%'
#   content_chunks.csv.gz  their chunks, text + metadata columns only
#   MANIFEST               row counts + sizes, for verify.sh
#
# Env: PGHOST PGUSER PGPASSWORD PGDATABASE (standard libpq), OUT_DIR.
set -eu

OUT_DIR="${OUT_DIR:?set OUT_DIR}"
mkdir -p "$OUT_DIR"

: >"$OUT_DIR/.counts"
copy_out() {
  name="$1"
  query="$2"
  echo "[dump] $name"
  psql -v ON_ERROR_STOP=1 -qAt \
    -c "\\copy ($query) TO STDOUT WITH (FORMAT csv, HEADER true)" | gzip -c >"$OUT_DIR/$name.csv.gz"
  rows="$(psql -v ON_ERROR_STOP=1 -qAt -c "SELECT count(*) FROM ($query) s")"
  printf '%s rows=%s\n' "$name" "$rows" >>"$OUT_DIR/.counts"
}

copy_out pages "
  SELECT id, source_id, slug, type, page_kind, title, frontmatter, compiled_truth,
         content_hash, body_hash, ecli, effective_date, effective_date_source,
         created_at, updated_at
    FROM pages WHERE deleted_at IS NULL AND source_id LIKE 'law-%'"

copy_out content_chunks "
  SELECT c.id, c.page_id, c.chunk_index, c.chunk_text, c.chunk_source, c.model,
         c.token_count, c.embedded_at, c.language, c.document_type, c.statute_abbr,
         c.paragraph_ref, c.absatz, c.ziffer, c.literal, c.chunk_role, c.court,
         c.case_number, c.ecli, c.decision_date, c.legal_area, c.canonical_label,
         c.source_id
    FROM content_chunks c
    JOIN pages p ON p.id = c.page_id
   WHERE p.deleted_at IS NULL AND p.source_id LIKE 'law-%'"

{
  echo "created_at=$(date -u +%FT%TZ)"
  echo "database=${PGDATABASE:-subsumio}"
  echo "excluded=embedding, embedding_qwen columns — regenerate with server/scripts/embed-into-column.ts"
  while read -r line; do
    name="${line%% *}"
    printf '%s %s bytes=%s\n' "$name" "${line#* }" "$(wc -c <"$OUT_DIR/$name.csv.gz" | tr -d ' ')"
  done <"$OUT_DIR/.counts"
} >"$OUT_DIR/MANIFEST"
rm -f "$OUT_DIR/.counts"

echo "[dump] done: $(du -sh "$OUT_DIR" | cut -f1)"
