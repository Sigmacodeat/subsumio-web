/**
 * Inventory of the Austrian law corpus per source, stored as a snapshot
 * every 10 minutes (table corpus_inventory_snapshot, migrations 143 + 147).
 *
 * Counting 1 M pages and 6.8 M chunks takes 20–40 s while imports run, so
 * the operator dashboard never counts live: the cron job
 * /api/cron/corpus-inventory computes and stores a snapshot; every panel on
 * /ops/corpus reads the latest one (3 ms) and shows its time. Before
 * 2026-09-24 two panels still ran the live join on every request — polled
 * every 5 s — which is what made the page unusably slow.
 */

import type { Pool } from "pg";

export interface InventoryRow {
  source_id: string;
  kind: "statute" | "decision" | "other";
  pages: number;
  /** Distinct import files — one per RIS document. The unit RIS totals use. */
  documents: number;
  statutes: number;
  rechtssaetze: number;
  texte: number;
  repealed: number;
  chunks: number;
  embedded: number;
  last_updated: string | null;
  measured_at?: string;
}

/** Computes the inventory from pages and content_chunks and stores it. Returns the rows. */
export async function computeAndStoreInventory(pool: Pool): Promise<InventoryRow[]> {
  const [pages, chunks] = await Promise.all([
    pool.query(`
      SELECT source_id,
             count(*)::int AS pages,
             count(DISTINCT import_filename) FILTER (WHERE import_filename IS NOT NULL)::int AS documents,
             count(DISTINCT frontmatter->>'statute_id')::int AS statutes,
             count(*) FILTER (WHERE frontmatter->>'doc_id' ~ '^J[A-Z]R_')::int AS rs,
             count(*) FILTER (WHERE frontmatter->>'doc_id' ~ '^J[A-Z]T_')::int AS texte,
             count(*) FILTER (WHERE (frontmatter->>'in_force_to') < to_char(now() AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD'))::int AS repealed,
             bool_or(frontmatter->>'doc_class' = 'decision' OR source_id LIKE 'law-%-judikatur%') AS is_decision,
             bool_or(frontmatter->>'doc_class' = 'statute') AS is_statute,
             max(updated_at) AS last_updated
      FROM pages
      WHERE deleted_at IS NULL AND source_id LIKE 'law-%'
      GROUP BY source_id`),
    pool.query(`
      SELECT c.source_id,
             count(*)::int AS chunks,
             count(*) FILTER (WHERE c.embedding IS NOT NULL)::int AS embedded
      FROM content_chunks c
      JOIN pages p ON p.id = c.page_id AND p.deleted_at IS NULL
      WHERE c.source_id LIKE 'law-%'
      GROUP BY c.source_id`),
  ]);
  const chunkBySource = new Map(chunks.rows.map((r) => [r.source_id as string, r]));
  const rows: InventoryRow[] = pages.rows.map((r) => {
    const c = chunkBySource.get(r.source_id);
    const kind: InventoryRow["kind"] = r.is_decision
      ? "decision"
      : r.is_statute
        ? "statute"
        : "other";
    return {
      source_id: r.source_id,
      kind,
      pages: r.pages,
      documents: r.documents ?? 0,
      statutes: kind === "statute" ? r.statutes : 0,
      rechtssaetze: r.rs,
      texte: r.texte,
      repealed: r.repealed,
      chunks: c?.chunks ?? 0,
      embedded: c?.embedded ?? 0,
      last_updated: r.last_updated ? new Date(r.last_updated).toISOString() : null,
    };
  });
  if (rows.length > 0) {
    await pool.query(
      `INSERT INTO corpus_inventory_snapshot
         (source_id, kind, pages, documents, statutes, rechtssaetze, texte, repealed, chunks, embedded, last_updated)
       SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[], $8::int[], $9::int[], $10::int[], $11::timestamptz[])`,
      [
        rows.map((r) => r.source_id),
        rows.map((r) => r.kind),
        rows.map((r) => r.pages),
        rows.map((r) => r.documents),
        rows.map((r) => r.statutes),
        rows.map((r) => r.rechtssaetze),
        rows.map((r) => r.texte),
        rows.map((r) => r.repealed),
        rows.map((r) => r.chunks),
        rows.map((r) => r.embedded),
        rows.map((r) => r.last_updated),
      ]
    );
  }
  return rows;
}

/** The latest stored row per source. Empty before the first snapshot. */
export async function readLatestInventory(pool: Pool): Promise<InventoryRow[]> {
  const res = await pool.query(`
    SELECT DISTINCT ON (source_id) source_id, kind, pages, documents, statutes, rechtssaetze, texte, repealed,
           chunks, embedded, last_updated, measured_at
    FROM corpus_inventory_snapshot
    ORDER BY source_id, measured_at DESC`);
  return res.rows.map((r) => ({
    ...r,
    documents: r.documents ?? 0,
    last_updated: r.last_updated ? new Date(r.last_updated).toISOString() : null,
    measured_at: new Date(r.measured_at).toISOString(),
  }));
}

/**
 * When the numbers were counted: the newest snapshot across all sources.
 * (Not rows[0] — the rows are ordered by source_id, so that would be the
 * alphabetically-first source's time.)
 */
export function latestSnapshotAt(rows: Pick<InventoryRow, "measured_at">[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    if (r.measured_at && (!latest || r.measured_at > latest)) latest = r.measured_at;
  }
  return latest;
}

/**
 * Live heartbeat to lay over the snapshot: the last write per source within
 * the past 15 minutes. Served by idx_pages_updated_at_desc in ~2 ms
 * (measured 2026-09-24), so the "läuft / hängt" signal on the pipeline tab
 * stays real-time even though the counts are up to 10 minutes old.
 */
export async function recentWritesBySource(pool: Pool): Promise<Map<string, string>> {
  const res = await pool.query(`
    SELECT source_id, max(updated_at) AS last_write
    FROM pages
    WHERE updated_at > now() - interval '15 minutes' AND source_id LIKE 'law-%'
    GROUP BY source_id`);
  return new Map(
    res.rows.map((r) => [r.source_id as string, new Date(r.last_write).toISOString()])
  );
}
