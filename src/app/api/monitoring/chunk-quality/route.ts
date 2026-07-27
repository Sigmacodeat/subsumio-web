import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const CURRENT_LEGAL_CHUNKER_VERSION = 4;
const CURRENT_MARKDOWN_CHUNKER_VERSION = 3;

/**
 * GET /api/monitoring/chunk-quality — Chunk quality analysis & re-chunk recommendations.
 *
 * Returns: chunker version mismatch analysis, chunk size histogram per chunker type,
 * boundary cohesion sample, oversized/undersized chunk samples, and a re-chunk
 * priority list grouped by source.
 *
 * Requires admin role.
 */
export const GET = createHandler(
  {
    action: "admin.*" as never,
    cacheMaxAge: 120,
  },
  async (_ctx) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    try {
      // ── 1. Chunker Version Mismatch Analysis (type-aware) ──
      const mismatchResult = await pool.query(`
        SELECT
          COALESCE(source_id, 'default') AS source,
          COALESCE(chunker_version::text, 'unknown') AS version,
          COALESCE(type, 'unknown') AS page_type,
          COUNT(*)::int AS page_count,
          COUNT(cc.id)::int AS chunk_count
        FROM pages p
        LEFT JOIN content_chunks cc ON cc.page_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY source_id, chunker_version, type
        ORDER BY page_count DESC
      `);

      const rechunk_recommendations: Array<{
        source: string;
        version: string;
        page_type: string;
        page_count: number;
        chunk_count: number;
        recommendation: string;
        priority: "high" | "medium" | "low";
      }> = [];

      const LEGAL_TYPES = new Set(["law", "statute", "court_decision", "judgement"]);

      for (const r of mismatchResult.rows) {
        const ver = r.version;
        const isLegal = LEGAL_TYPES.has(r.page_type);
        const targetVersion = isLegal
          ? CURRENT_LEGAL_CHUNKER_VERSION
          : CURRENT_MARKDOWN_CHUNKER_VERSION;
        if (ver === "unknown") {
          rechunk_recommendations.push({
            source: r.source,
            version: ver,
            page_type: r.page_type,
            page_count: r.page_count,
            chunk_count: r.chunk_count,
            recommendation: isLegal
              ? `Unversioniert — §-aware Re-Chunk erforderlich (v${CURRENT_LEGAL_CHUNKER_VERSION})`
              : "Unversioniert — Recursive Re-Chunk erforderlich (v3)",
            priority: r.page_count > 1000 ? "high" : r.page_count > 100 ? "medium" : "low",
          });
        } else {
          const v = parseInt(ver, 10);
          if (v < targetVersion) {
            rechunk_recommendations.push({
              source: r.source,
              version: ver,
              page_type: r.page_type,
              page_count: r.page_count,
              chunk_count: r.chunk_count,
              recommendation: isLegal
                ? `§-aware Re-Chunk empfohlen (v${ver} → v${CURRENT_LEGAL_CHUNKER_VERSION})`
                : `Recursive Re-Chunk empfohlen (v${ver} → v${CURRENT_MARKDOWN_CHUNKER_VERSION})`,
              priority: r.page_count > 1000 ? "high" : r.page_count > 100 ? "medium" : "low",
            });
          }
        }
      }

      // ── 2. Chunk Size Histogram by Chunker Type ──
      const histogramResult = await pool.query(`
        SELECT
          COALESCE(p.chunker_version::text, 'unknown') AS chunker_version,
          COUNT(*) FILTER (WHERE LENGTH(cc.chunk_text) < 200)::int AS undersized,
          COUNT(*) FILTER (WHERE LENGTH(cc.chunk_text) >= 200 AND LENGTH(cc.chunk_text) < 1000)::int AS small,
          COUNT(*) FILTER (WHERE LENGTH(cc.chunk_text) >= 1000 AND LENGTH(cc.chunk_text) < 3000)::int AS optimal,
          COUNT(*) FILTER (WHERE LENGTH(cc.chunk_text) >= 3000 AND LENGTH(cc.chunk_text) <= 6000)::int AS large,
          COUNT(*) FILTER (WHERE LENGTH(cc.chunk_text) > 6000)::int AS oversized
        FROM content_chunks cc
        JOIN pages p ON p.id = cc.page_id
        WHERE p.deleted_at IS NULL
        GROUP BY p.chunker_version
        ORDER BY chunker_version
      `);
      const histogram_by_version: Array<{
        chunker_version: string;
        undersized: number;
        small: number;
        optimal: number;
        large: number;
        oversized: number;
      }> = histogramResult.rows.map((r) => ({
        chunker_version: r.chunker_version,
        undersized: r.undersized ?? 0,
        small: r.small ?? 0,
        optimal: r.optimal ?? 0,
        large: r.large ?? 0,
        oversized: r.oversized ?? 0,
      }));

      // ── 3. Oversized Chunk Samples (top 10) ──
      let oversized_samples: Array<{
        slug: string;
        chunk_index: number;
        char_length: number;
        source_id: string;
      }> = [];
      try {
        const oversizedResult = await pool.query(`
          SELECT p.slug, cc.index AS chunk_index, LENGTH(cc.chunk_text)::int AS char_length,
                 COALESCE(p.source_id, 'default') AS source_id
          FROM content_chunks cc
          JOIN pages p ON p.id = cc.page_id
          WHERE p.deleted_at IS NULL AND LENGTH(cc.chunk_text) > 6000
          ORDER BY LENGTH(cc.chunk_text) DESC
          LIMIT 10
        `);
        oversized_samples = oversizedResult.rows.map((r) => ({
          slug: r.slug,
          chunk_index: r.chunk_index,
          char_length: r.char_length,
          source_id: r.source_id,
        }));
      } catch {
        // graceful
      }

      // ── 4. Undersized Chunk Samples (top 10) ──
      let undersized_samples: Array<{
        slug: string;
        chunk_index: number;
        char_length: number;
        source_id: string;
      }> = [];
      try {
        const undersizedResult = await pool.query(`
          SELECT p.slug, cc.index AS chunk_index, LENGTH(cc.chunk_text)::int AS char_length,
                 COALESCE(p.source_id, 'default') AS source_id
          FROM content_chunks cc
          JOIN pages p ON p.id = cc.page_id
          WHERE p.deleted_at IS NULL AND LENGTH(cc.chunk_text) < 50
          ORDER BY LENGTH(cc.chunk_text) ASC
          LIMIT 10
        `);
        undersized_samples = undersizedResult.rows.map((r) => ({
          slug: r.slug,
          chunk_index: r.chunk_index,
          char_length: r.char_length,
          source_id: r.source_id,
        }));
      } catch {
        // graceful
      }

      // ── 5. Boundary Cohesion Check ──
      // Chunks that don't end at a sentence boundary (., !, ?, §, ¶, :) are potentially split mid-sentence
      let boundary_cohesion: {
        total_checked: number;
        clean_endings: number;
        mid_sentence: number;
        cohesion_pct: number;
        samples: Array<{ slug: string; chunk_index: number; ending_chars: string }>;
      } = {
        total_checked: 0,
        clean_endings: 0,
        mid_sentence: 0,
        cohesion_pct: 0,
        samples: [],
      };
      try {
        const cohesionResult = await pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE rtrim(cc.chunk_text) ~ '[.!?¶§:)]"»]$'
            )::int AS clean
          FROM content_chunks cc
          JOIN pages p ON p.id = cc.page_id
          WHERE p.deleted_at IS NULL AND LENGTH(cc.chunk_text) > 100
        `);
        const total = cohesionResult.rows[0]?.total ?? 0;
        const clean = cohesionResult.rows[0]?.clean ?? 0;
        const mid = total - clean;
        const pct = total > 0 ? Math.round((clean / total) * 1000) / 10 : 0;

        // Get sample mid-sentence chunks
        const sampleResult = await pool.query(`
          SELECT p.slug, cc.index AS chunk_index, RIGHT(rtrim(cc.chunk_text), 40) AS ending_chars
          FROM content_chunks cc
          JOIN pages p ON p.id = cc.page_id
          WHERE p.deleted_at IS NULL
            AND LENGTH(cc.chunk_text) > 100
            AND rtrim(cc.chunk_text) !~ '[.!?¶§:)]"»]$'
          LIMIT 10
        `);
        const samples = sampleResult.rows.map((r) => ({
          slug: r.slug,
          chunk_index: r.chunk_index,
          ending_chars: r.ending_chars,
        }));

        boundary_cohesion = {
          total_checked: total,
          clean_endings: clean,
          mid_sentence: mid,
          cohesion_pct: pct,
          samples,
        };
      } catch {
        // graceful
      }

      // ── 6. Re-Chunk Priority Queue ──
      // Pages with outdated chunker versions, grouped by source, sorted by chunk count
      let rechunk_queue: Array<{
        source: string;
        total_pages: number;
        total_chunks: number;
        versions: string;
      }> = [];
      try {
        const queueResult = await pool.query(`
          SELECT
            COALESCE(p.source_id, 'default') AS source,
            COUNT(DISTINCT p.id)::int AS total_pages,
            COUNT(cc.id)::int AS total_chunks,
            STRING_AGG(DISTINCT COALESCE(p.chunker_version::text, 'unknown'), ', ') AS versions
          FROM pages p
          LEFT JOIN content_chunks cc ON cc.page_id = p.id
          WHERE p.deleted_at IS NULL
            AND (p.chunker_version IS NULL OR p.chunker_version::int < 4)
          GROUP BY p.source_id
          ORDER BY total_chunks DESC
        `);
        rechunk_queue = queueResult.rows.map((r) => ({
          source: r.source,
          total_pages: r.total_pages,
          total_chunks: r.total_chunks,
          versions: r.versions,
        }));
      } catch {
        // graceful
      }

      // ── 7. Summary Stats ──
      const total_oversized = histogram_by_version.reduce((s, h) => s + h.oversized, 0);
      const total_undersized = histogram_by_version.reduce((s, h) => s + h.undersized, 0);
      const total_rechunk_pages = rechunk_recommendations.reduce((s, r) => s + r.page_count, 0);

      return apiSuccess({
        rechunk_recommendations,
        rechunk_queue,
        histogram_by_version,
        oversized_samples,
        undersized_samples,
        boundary_cohesion,
        summary: {
          total_oversized,
          total_undersized,
          total_rechunk_pages,
          current_legal_version: CURRENT_LEGAL_CHUNKER_VERSION,
          current_markdown_version: CURRENT_MARKDOWN_CHUNKER_VERSION,
        },
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(
        "[chunk-quality] Failed to generate:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "internal_error",
        err instanceof Error ? err.message : "Failed to generate chunk quality analysis",
        500
      );
    }
  }
);
