/**
 * Chunk-quality snapshot of the law corpus (table corpus_quality_snapshot,
 * migration 148), computed every 10 minutes by /api/cron/corpus-inventory
 * right after the inventory.
 *
 * The quality tab on /ops/corpus used to run three live aggregations on
 * every open — a pages×chunks join with AVG(length(chunk_text)) over 6.8 M
 * rows among them — and refetched them every 5 s while embedding ran. Now
 * the exact counts (chunks, embedded, pages per source) come from the
 * inventory snapshot, and the text statistics (role mix, length histogram,
 * average length) come from a 1 % TABLESAMPLE scaled to those exact counts.
 * Reading the result is one row (ms), and the tab shows the snapshot time.
 */

import type { Pool } from "pg";
import type { InventoryRow } from "./corpus-inventory";

export interface RoleBucket {
  role: string;
  count: number;
}
export interface LengthBucket {
  bucket: string;
  label: string;
  count: number;
}
export interface SourceQualityRow {
  source: string;
  pages: number;
  chunks: number;
  embedded: number;
  coveragePct: number;
  avgLength: number;
}
export interface QualitySnapshot {
  totalChunks: number;
  embeddedChunks: number;
  embeddingCoveragePct: number;
  avgLength: number;
  roleDistribution: RoleBucket[];
  lengthHistogram: LengthBucket[];
  perSource: SourceQualityRow[];
  /** How many chunks the 1 % sample actually contained (0 = no text stats). */
  sampledChunks: number;
}

export const LENGTH_BUCKETS: Array<{ bucket: string; label: string }> = [
  { bucket: "tiny", label: "<50" },
  { bucket: "small", label: "50–200" },
  { bucket: "medium", label: "200–500" },
  { bucket: "optimal", label: "500–1500" },
  { bucket: "large", label: "1500–3000" },
  { bucket: "oversized", label: ">3000" },
];

/** One row of the sample query: a (source, role) cell with its length stats. */
export interface SampleRow {
  source_id: string;
  chunk_role: string | null;
  n: number;
  avg_len: number;
  tiny: number;
  small: number;
  medium: number;
  optimal: number;
  large: number;
  oversized: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pure: combines the exact per-source counts from the inventory with the
 * sampled text statistics. Sample counts are scaled to the exact chunk total
 * (overall for the histogram and role mix, per source for the average length
 * the sample already gives directly).
 */
export function buildQualitySnapshot(
  inventory: Pick<InventoryRow, "source_id" | "pages" | "chunks" | "embedded">[],
  sample: SampleRow[]
): QualitySnapshot {
  const totalChunks = inventory.reduce((s, r) => s + r.chunks, 0);
  const embeddedChunks = inventory.reduce((s, r) => s + r.embedded, 0);
  const sampledChunks = sample.reduce((s, r) => s + r.n, 0);
  const scale = sampledChunks > 0 ? totalChunks / sampledChunks : 0;

  const roleCounts = new Map<string, number>();
  const bucketCounts = new Map<string, number>();
  let lengthSum = 0;
  const perSourceLen = new Map<string, { sum: number; n: number }>();
  for (const r of sample) {
    const role = r.chunk_role ?? "(leer)";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + r.n);
    for (const b of LENGTH_BUCKETS) {
      bucketCounts.set(
        b.bucket,
        (bucketCounts.get(b.bucket) ?? 0) + (r[b.bucket as keyof SampleRow] as number)
      );
    }
    lengthSum += r.avg_len * r.n;
    const acc = perSourceLen.get(r.source_id) ?? { sum: 0, n: 0 };
    acc.sum += r.avg_len * r.n;
    acc.n += r.n;
    perSourceLen.set(r.source_id, acc);
  }

  const roleDistribution: RoleBucket[] = [...roleCounts.entries()]
    .map(([role, n]) => ({ role, count: Math.round(n * scale) }))
    .sort((a, b) => b.count - a.count);
  const lengthHistogram: LengthBucket[] = LENGTH_BUCKETS.map((b) => ({
    bucket: b.bucket,
    label: b.label,
    count: Math.round((bucketCounts.get(b.bucket) ?? 0) * scale),
  }));
  const perSource: SourceQualityRow[] = inventory
    .map((r) => {
      const len = perSourceLen.get(r.source_id);
      return {
        source: r.source_id,
        pages: r.pages,
        chunks: r.chunks,
        embedded: r.embedded,
        coveragePct: r.chunks > 0 ? round1((r.embedded / r.chunks) * 100) : 0,
        avgLength: len && len.n > 0 ? Math.round(len.sum / len.n) : 0,
      };
    })
    .sort((a, b) => b.chunks - a.chunks);

  return {
    totalChunks,
    embeddedChunks,
    embeddingCoveragePct: totalChunks > 0 ? round1((embeddedChunks / totalChunks) * 100) : 0,
    avgLength: sampledChunks > 0 ? Math.round(lengthSum / sampledChunks) : 0,
    roleDistribution,
    lengthHistogram,
    perSource,
    sampledChunks,
  };
}

/** Samples 1 % of the law chunks (seconds, not minutes) and stores the snapshot. */
export async function computeAndStoreQuality(
  pool: Pool,
  inventory: InventoryRow[]
): Promise<QualitySnapshot> {
  const res = await pool.query(`
    SELECT c.source_id,
           c.chunk_role,
           count(*)::int AS n,
           avg(length(c.chunk_text))::float AS avg_len,
           count(*) FILTER (WHERE length(c.chunk_text) < 50)::int AS tiny,
           count(*) FILTER (WHERE length(c.chunk_text) >= 50 AND length(c.chunk_text) < 200)::int AS small,
           count(*) FILTER (WHERE length(c.chunk_text) >= 200 AND length(c.chunk_text) < 500)::int AS medium,
           count(*) FILTER (WHERE length(c.chunk_text) >= 500 AND length(c.chunk_text) < 1500)::int AS optimal,
           count(*) FILTER (WHERE length(c.chunk_text) >= 1500 AND length(c.chunk_text) < 3000)::int AS large,
           count(*) FILTER (WHERE length(c.chunk_text) >= 3000)::int AS oversized
    FROM content_chunks c TABLESAMPLE SYSTEM (1)
    JOIN pages p ON p.id = c.page_id AND p.deleted_at IS NULL
    WHERE c.source_id LIKE 'law-%'
    GROUP BY c.source_id, c.chunk_role`);
  const snapshot = buildQualitySnapshot(inventory, res.rows as SampleRow[]);
  await pool.query(`INSERT INTO corpus_quality_snapshot (payload) VALUES ($1::jsonb)`, [
    JSON.stringify(snapshot),
  ]);
  return snapshot;
}

/** The newest stored snapshot with its time, or null before the first run. */
export async function readLatestQuality(
  pool: Pool
): Promise<{ snapshot: QualitySnapshot; measured_at: string } | null> {
  const res = await pool.query(
    `SELECT payload, measured_at FROM corpus_quality_snapshot ORDER BY measured_at DESC LIMIT 1`
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    snapshot: row.payload as QualitySnapshot,
    measured_at: new Date(row.measured_at).toISOString(),
  };
}
