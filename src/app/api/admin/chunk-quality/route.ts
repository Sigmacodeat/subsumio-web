import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RoleBucket {
  role: string;
  count: number;
}
interface LengthBucket {
  bucket: string;
  label: string;
  count: number;
}
interface SourceRow {
  source: string;
  pages: number;
  chunks: number;
  embedded: number;
  coveragePct: number;
  avgLength: number;
}
interface QualityData {
  totalChunks: number;
  embeddedChunks: number;
  embeddingCoveragePct: number;
  avgLength: number;
  roleDistribution: RoleBucket[];
  lengthHistogram: LengthBucket[];
  perSource: SourceRow[];
  generatedAt: string;
}

const LENGTH_BUCKETS: Array<{ bucket: string; label: string; min: number; max: number }> = [
  { bucket: "tiny", label: "<50", min: 0, max: 50 },
  { bucket: "small", label: "50–200", min: 50, max: 200 },
  { bucket: "medium", label: "200–500", min: 200, max: 500 },
  { bucket: "optimal", label: "500–1500", min: 500, max: 1500 },
  { bucket: "large", label: "1500–3000", min: 1500, max: 3000 },
  { bucket: "oversized", label: ">3000", min: 3000, max: Number.MAX_SAFE_INTEGER },
];

/**
 * GET /api/admin/chunk-quality
 *
 * Aggregierte Chunk-Qualitäts-Statistiken für das Quality-Dashboard.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    cacheMaxAge: 30,
  },
  async () => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Datenbank nicht verfügbar", 503);
    }

    // Run all aggregation queries in parallel for speed.
    // NOTE: length(chunk_text) over 1M+ rows is expensive — we use
    // a TABLESAMPLE sample for the length histogram and avg, and
    // exact counts for role distribution and per-source stats.
    let roleResult, sourceResult, sampleResult;
    try {
      [roleResult, sourceResult, sampleResult] = await Promise.all([
        // Role distribution (exact, fast — no length() needed)
        pool.query(`
        SELECT cc.chunk_role, COUNT(*)::bigint AS cnt
        FROM content_chunks cc
        JOIN pages p ON cc.page_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY cc.chunk_role
        ORDER BY cnt DESC
      `),

        // Per-source stats (exact counts + avg length — die JOIN auf
        // content_chunks ist ohnehin da, AVG(length()) ist kostenlos dazu)
        pool.query(`
        SELECT
          p.source_id,
          COUNT(DISTINCT p.id)::bigint AS pages,
          COUNT(cc.id)::bigint AS chunks,
          COUNT(cc.id) FILTER (WHERE cc.embedding IS NOT NULL)::bigint AS embedded,
          COALESCE(AVG(length(cc.chunk_text)), 0)::float AS avg_length
        FROM pages p
        LEFT JOIN content_chunks cc ON cc.page_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.source_id
        ORDER BY chunks DESC
      `),

        // Length histogram + avg from a 1% sample (fast, representative)
        pool.query(`
        SELECT
          COUNT(*)::bigint AS sampled,
          COUNT(*) FILTER (WHERE length(cc.chunk_text) < 50)::bigint AS tiny,
          COUNT(*) FILTER (WHERE length(cc.chunk_text) >= 50 AND length(cc.chunk_text) < 200)::bigint AS small,
          COUNT(*) FILTER (WHERE length(cc.chunk_text) >= 200 AND length(cc.chunk_text) < 500)::bigint AS medium,
          COUNT(*) FILTER (WHERE length(cc.chunk_text) >= 500 AND length(cc.chunk_text) < 1500)::bigint AS optimal,
          COUNT(*) FILTER (WHERE length(cc.chunk_text) >= 1500 AND length(cc.chunk_text) < 3000)::bigint AS large,
          COUNT(*) FILTER (WHERE length(cc.chunk_text) >= 3000)::bigint AS oversized,
          COALESCE(AVG(length(cc.chunk_text)), 0)::float AS avg_length
        FROM content_chunks cc TABLESAMPLE SYSTEM(1)
        JOIN pages p ON cc.page_id = p.id
        WHERE p.deleted_at IS NULL
      `),
      ]);
    } catch (err) {
      console.error("[chunk-quality] query failed:", (err as Error).message);
      return apiSuccess({
        totalChunks: 0,
        embeddedChunks: 0,
        embeddingCoveragePct: 0,
        avgLength: 0,
        roleDistribution: [],
        lengthHistogram: [],
        perSource: [],
        generatedAt: new Date().toISOString(),
      });
    }

    const roleDistribution: RoleBucket[] = roleResult.rows.map((r) => ({
      role: r.chunk_role ?? "(leer)",
      count: parseInt(r.cnt, 10),
    }));

    // Scale sample histogram to total (sample is ~1% of chunks)
    const s = sampleResult.rows[0] ?? {};
    const sampled = parseInt(s.sampled ?? "0", 10);
    const scale = sampled > 0 ? roleDistribution.reduce((sum, r) => sum + r.count, 0) / sampled : 1;
    const h = s;
    const lengthHistogram: LengthBucket[] = LENGTH_BUCKETS.map((b) => ({
      bucket: b.bucket,
      label: b.label,
      count: Math.round(parseInt(h[b.bucket] ?? "0", 10) * scale),
    }));

    const perSource: SourceRow[] = sourceResult.rows.map((r) => ({
      source: r.source_id ?? "unknown",
      pages: parseInt(r.pages, 10),
      chunks: parseInt(r.chunks, 10),
      embedded: parseInt(r.embedded, 10),
      coveragePct:
        parseInt(r.chunks, 10) > 0
          ? Math.round((parseInt(r.embedded, 10) / parseInt(r.chunks, 10)) * 1000) / 10
          : 0,
      avgLength: Math.round(parseFloat(r.avg_length ?? "0")),
    }));

    // Totals
    const totalChunks = perSource.reduce((s, r) => s + r.chunks, 0);
    const embeddedChunks = perSource.reduce((s, r) => s + r.embedded, 0);
    const embeddingCoveragePct =
      totalChunks > 0 ? Math.round((embeddedChunks / totalChunks) * 1000) / 10 : 0;
    const avgLength = Math.round(parseFloat(s.avg_length ?? "0"));

    const data: QualityData = {
      totalChunks,
      embeddedChunks,
      embeddingCoveragePct,
      avgLength,
      roleDistribution,
      lengthHistogram,
      perSource,
      generatedAt: new Date().toISOString(),
    };

    return apiSuccess(data);
  }
);
