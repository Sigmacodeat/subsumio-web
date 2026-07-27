import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { saveQualitySnapshot } from "@/lib/quality-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * GET /api/monitoring/corpus-stats — Comprehensive corpus & embedding statistics.
 *
 * Returns: corpus overview, embedding coverage, chunking stats (chunker versions,
 * page types, chunk size distribution), per-source breakdown, search telemetry,
 * amendment summary, and health checks.
 *
 * Requires admin role.
 */
export const GET = createHandler(
  {
    action: "admin.*" as never,
    cacheMaxAge: 60,
  },
  async (ctx) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Database not available", 503);
    }

    try {
      // ── 1. Corpus Overview ──
      const pagesResult = await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS live
        FROM pages
      `);
      const total_pages = pagesResult.rows[0]?.live ?? 0;

      const chunksResult = await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
        FROM content_chunks cc
        JOIN pages p ON p.id = cc.page_id
        WHERE p.deleted_at IS NULL
      `);
      const total_chunks = chunksResult.rows[0]?.total ?? 0;
      const embedded_chunks = chunksResult.rows[0]?.embedded ?? 0;
      const stale_chunks = total_chunks - embedded_chunks;
      const embedding_coverage_pct = total_chunks > 0 ? (embedded_chunks / total_chunks) * 100 : 0;

      // Orphan pages
      const orphanResult = await pool.query(`
        SELECT COUNT(*)::int AS n FROM pages p
        WHERE p.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM links l WHERE l.to_page_id = p.id)
      `);
      const orphan_pages = orphanResult.rows[0]?.n ?? 0;

      // ── 2. Embedding Models ──
      const modelsResult = await pool.query(`
        SELECT COALESCE(embedding_model, 'none') AS model, COUNT(*)::int AS n
        FROM content_chunks cc
        JOIN pages p ON p.id = cc.page_id
        WHERE p.deleted_at IS NULL
        GROUP BY embedding_model ORDER BY n DESC
      `);
      const chunks_by_model: Record<string, number> = {};
      for (const r of modelsResult.rows) {
        chunks_by_model[r.model] = r.n;
      }

      // ── 3. Chunker Version Distribution ──
      const chunkerVersionResult = await pool.query(`
        SELECT COALESCE(chunker_version::text, 'unknown') AS version, COUNT(*)::int AS n
        FROM pages
        WHERE deleted_at IS NULL
        GROUP BY chunker_version ORDER BY n DESC
      `);
      const chunker_versions: Array<{ version: string; count: number }> =
        chunkerVersionResult.rows.map((r) => ({ version: r.version, count: r.n }));

      // ── 4. Page Type Distribution ──
      const typeResult = await pool.query(`
        SELECT COALESCE(type, 'unknown') AS type, COUNT(*)::int AS n
        FROM pages
        WHERE deleted_at IS NULL
        GROUP BY type ORDER BY n DESC
      `);
      const page_types: Array<{ type: string; count: number }> = typeResult.rows.map((r) => ({
        type: r.type,
        count: r.n,
      }));

      // ── 5. Chunk Size Distribution (chars + words) ──
      const sizeDistResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE LENGTH(chunk_text) < 200)::int AS undersized_chars,
          COUNT(*) FILTER (WHERE LENGTH(chunk_text) >= 200 AND LENGTH(chunk_text) < 1000)::int AS small_chars,
          COUNT(*) FILTER (WHERE LENGTH(chunk_text) >= 1000 AND LENGTH(chunk_text) < 3000)::int AS optimal_chars,
          COUNT(*) FILTER (WHERE LENGTH(chunk_text) >= 3000 AND LENGTH(chunk_text) <= 6000)::int AS large_chars,
          COUNT(*) FILTER (WHERE LENGTH(chunk_text) > 6000)::int AS oversized_chars,
          COUNT(*) FILTER (WHERE array_length(regexp_split_to_array(chunk_text, '\s+'), 1) < 100)::int AS undersized_words,
          COUNT(*) FILTER (WHERE array_length(regexp_split_to_array(chunk_text, '\s+'), 1) >= 100 AND array_length(regexp_split_to_array(chunk_text, '\s+'), 1) < 250)::int AS small_words,
          COUNT(*) FILTER (WHERE array_length(regexp_split_to_array(chunk_text, '\s+'), 1) >= 250 AND array_length(regexp_split_to_array(chunk_text, '\s+'), 1) < 500)::int AS optimal_words,
          COUNT(*) FILTER (WHERE array_length(regexp_split_to_array(chunk_text, '\s+'), 1) >= 500 AND array_length(regexp_split_to_array(chunk_text, '\s+'), 1) <= 1000)::int AS large_words,
          COUNT(*) FILTER (WHERE array_length(regexp_split_to_array(chunk_text, '\s+'), 1) > 1000)::int AS oversized_words,
          AVG(LENGTH(chunk_text))::float AS avg_chars,
          MIN(LENGTH(chunk_text))::int AS min_chars,
          MAX(LENGTH(chunk_text))::int AS max_chars,
          AVG(array_length(regexp_split_to_array(chunk_text, '\s+'), 1))::float AS avg_words,
          MIN(array_length(regexp_split_to_array(chunk_text, '\s+'), 1))::int AS min_words,
          MAX(array_length(regexp_split_to_array(chunk_text, '\s+'), 1))::int AS max_words
        FROM content_chunks cc
        JOIN pages p ON p.id = cc.page_id
        WHERE p.deleted_at IS NULL
      `);
      const sizeDist = sizeDistResult.rows[0] ?? {};
      const chunk_size_distribution = {
        undersized: sizeDist.undersized_chars ?? 0,
        small: sizeDist.small_chars ?? 0,
        optimal: sizeDist.optimal_chars ?? 0,
        large: sizeDist.large_chars ?? 0,
        oversized: sizeDist.oversized_chars ?? 0,
      };
      const chunk_size_distribution_words = {
        undersized: sizeDist.undersized_words ?? 0,
        small: sizeDist.small_words ?? 0,
        optimal: sizeDist.optimal_words ?? 0,
        large: sizeDist.large_words ?? 0,
        oversized: sizeDist.oversized_words ?? 0,
      };
      const avg_chunk_chars = sizeDist.avg_chars ? Math.round(sizeDist.avg_chars) : 0;
      const max_chunk_chars = sizeDist.max_chars ?? 0;
      const min_chunk_chars = sizeDist.min_chars ?? 0;
      const avg_chunk_words = sizeDist.avg_words ? Math.round(sizeDist.avg_words) : 0;
      const max_chunk_words = sizeDist.max_words ?? 0;
      const min_chunk_words = sizeDist.min_words ?? 0;
      const oversized_chunks = chunk_size_distribution.oversized;
      const undersized_chunks =
        chunk_size_distribution.undersized + chunk_size_distribution_words.undersized;

      // ── 6. Per-Source Breakdown + top-level maps ──
      const sourceResult = await pool.query(`
        SELECT
          COALESCE(p.source_id, 'default') AS source,
          COUNT(DISTINCT p.id)::int AS pages,
          COUNT(cc.id)::int AS chunks,
          COUNT(cc.id) FILTER (WHERE cc.embedding IS NOT NULL)::int AS embedded,
          COUNT(cc.id) FILTER (WHERE cc.embedding IS NULL)::int AS stale
        FROM pages p
        LEFT JOIN content_chunks cc ON cc.page_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.source_id ORDER BY chunks DESC
      `);
      const pages_by_source: Record<string, number> = {};
      const chunks_by_source: Record<string, number> = {};
      const per_source: Array<{
        source: string;
        pages: number;
        chunks: number;
        embedded: number;
        stale: number;
        coverage_pct: number;
      }> = sourceResult.rows.map((r) => {
        pages_by_source[r.source] = r.pages;
        chunks_by_source[r.source] = r.chunks;
        return {
          source: r.source,
          pages: r.pages,
          chunks: r.chunks,
          embedded: r.embedded,
          stale: r.stale,
          coverage_pct: r.chunks > 0 ? Math.round((r.embedded / r.chunks) * 1000) / 10 : 0,
        };
      });

      // ── 7. Search Telemetry (7d) ──
      let search_telemetry: {
        total_calls_7d: number;
        cache_hit_rate_7d: number;
        avg_results_7d: number;
        avg_rank1_score: number | null;
        rank1_distribution: { lt_solid: number; solid: number; high: number } | null;
        intent_distribution: Record<string, number> | null;
      } | null = null;
      try {
        const searchResult = await pool.query(`
          SELECT
            SUM(count)::int AS total_calls,
            SUM(cache_hit)::int AS cache_hits,
            SUM(sum_results)::int AS sum_results,
            SUM(sum_rank1_score)::float AS sum_rank1_score,
            SUM(count_rank1)::int AS count_rank1,
            SUM(rank1_lt_solid)::int AS rank1_lt_solid,
            SUM(rank1_solid)::int AS rank1_solid,
            SUM(rank1_high)::int AS rank1_high
          FROM search_telemetry
          WHERE date >= (NOW() - INTERVAL '7 days')::text
        `);
        const sr = searchResult.rows[0];
        if (sr && sr.total_calls && sr.total_calls > 0) {
          const intentResult = await pool.query(`
            SELECT intent, SUM(count)::int AS count
            FROM search_telemetry
            WHERE date >= (NOW() - INTERVAL '7 days')::text
            GROUP BY intent ORDER BY count DESC
          `);
          const intent_distribution: Record<string, number> = {};
          for (const ir of intentResult.rows) {
            intent_distribution[ir.intent] = ir.count ?? 0;
          }

          search_telemetry = {
            total_calls_7d: sr.total_calls,
            cache_hit_rate_7d: Math.round((sr.cache_hits / sr.total_calls) * 1000) / 1000,
            avg_results_7d: Math.round((sr.sum_results / sr.total_calls) * 10) / 10,
            avg_rank1_score:
              sr.count_rank1 > 0
                ? Math.round((sr.sum_rank1_score / sr.count_rank1) * 1000) / 1000
                : null,
            rank1_distribution: {
              lt_solid: sr.rank1_lt_solid ?? 0,
              solid: sr.rank1_solid ?? 0,
              high: sr.rank1_high ?? 0,
            },
            intent_distribution,
          };
        }
      } catch {
        // search_telemetry table may not exist
      }

      // ── 8. Amendment Summary (30d) ──
      let amendments: {
        total_30d: number;
        by_change_type: { added: number; modified: number; removed: number };
        by_jurisdiction: Record<string, number>;
        statutes_affected: number;
        unresolved_stale_outputs: number;
      } | null = null;
      try {
        const amendmentResult = await pool.query(`
          SELECT COUNT(*)::int AS n FROM corpus_amendments
          WHERE detected_at >= NOW() - INTERVAL '30 days'
        `);
        const byTypeResult = await pool.query(`
          SELECT change_type, COUNT(*)::int AS n
          FROM corpus_amendments
          WHERE detected_at >= NOW() - INTERVAL '30 days'
          GROUP BY change_type
        `);
        const byJurisdictionResult = await pool.query(`
          SELECT jurisdiction, COUNT(*)::int AS n
          FROM corpus_amendments
          WHERE detected_at >= NOW() - INTERVAL '30 days' AND jurisdiction IS NOT NULL
          GROUP BY jurisdiction
        `);
        const statutesResult = await pool.query(`
          SELECT COUNT(DISTINCT statute_id)::int AS n FROM corpus_amendments
          WHERE detected_at >= NOW() - INTERVAL '30 days'
        `);
        const staleResult = await pool.query(`
          SELECT COUNT(*)::int AS n FROM stale_outputs WHERE resolved_at IS NULL
        `);
        const by_change_type = { added: 0, modified: 0, removed: 0 };
        for (const r of byTypeResult.rows) {
          if (r.change_type === "added") by_change_type.added = r.n;
          if (r.change_type === "modified") by_change_type.modified = r.n;
          if (r.change_type === "removed") by_change_type.removed = r.n;
        }
        const by_jurisdiction: Record<string, number> = {};
        for (const r of byJurisdictionResult.rows) {
          by_jurisdiction[r.jurisdiction] = r.n;
        }
        amendments = {
          total_30d: amendmentResult.rows[0]?.n ?? 0,
          by_change_type,
          by_jurisdiction,
          statutes_affected: statutesResult.rows[0]?.n ?? 0,
          unresolved_stale_outputs: staleResult.rows[0]?.n ?? 0,
        };
      } catch {
        // tables may not exist
      }

      // ── 9. Snapshot Freshness ──
      let snapshots: {
        current: number;
        jurisdictions: string[];
        newest: string | null;
      } | null = null;
      try {
        const snapshotResult = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE valid_to IS NULL)::int AS current,
            ARRAY_AGG(DISTINCT jurisdiction) AS jurisdictions,
            MAX(valid_from)::text AS newest
          FROM corpus_snapshots
        `);
        const snap = snapshotResult.rows[0];
        if (snap) {
          snapshots = {
            current: snap.current ?? 0,
            jurisdictions: (snap.jurisdictions as string[]) ?? [],
            newest: snap.newest ?? null,
          };
        }
      } catch {
        // table may not exist
      }

      // ── 10. Hallucination / Trace Metrics (7d) ──
      let hallucination: {
        total_traces: number;
        guardrail_pass_rate: number;
        cross_verify_clean_rate: number;
        hallucination_rate: number;
        regeneration_rate: number;
        avg_confidence: number | null;
        low_confidence_rate: number;
        provenance_coverage: number;
      } | null = null;
      try {
        const hallucResult = await pool.query(`
          SELECT
            COUNT(*)::int AS total_traces,
            COUNT(*) FILTER (WHERE guardrail_passed = true)::int AS guardrail_passed_count,
            COUNT(*) FILTER (WHERE guardrail_passed IS NOT NULL)::int AS guardrail_known,
            COUNT(*) FILTER (WHERE cross_verify_clean = true)::int AS cross_verify_clean_count,
            COUNT(*) FILTER (WHERE cross_verify_clean IS NOT NULL)::int AS cross_verify_known,
            COUNT(*) FILTER (WHERE guardrail_passed = false OR cross_verify_clean = false)::int AS hallucination_count,
            COUNT(*) FILTER (WHERE regeneration_count > 0)::int AS regeneration_count,
            AVG(overall_confidence) AS avg_confidence,
            COUNT(*) FILTER (WHERE confidence_level = 'low')::int AS low_confidence_count,
            COUNT(*) FILTER (WHERE confidence_level IS NOT NULL)::int AS confidence_known,
            COUNT(*) FILTER (WHERE provenance_links IS NOT NULL AND jsonb_typeof(provenance_links) = 'array' AND jsonb_array_length(provenance_links) > 0)::int AS provenance_count
          FROM subsumio_reasoning_traces
          WHERE timestamp >= NOW() - INTERVAL '7 days'
        `);
        const r = hallucResult.rows[0];
        if (r && r.total_traces > 0) {
          const total = r.total_traces;
          const guardrailKnown = r.guardrail_known || total;
          const crossVerifyKnown = r.cross_verify_known || total;
          const confidenceKnown = r.confidence_known || total;
          hallucination = {
            total_traces: total,
            guardrail_pass_rate:
              guardrailKnown > 0
                ? Math.round((r.guardrail_passed_count / guardrailKnown) * 1000) / 10
                : 0,
            cross_verify_clean_rate:
              crossVerifyKnown > 0
                ? Math.round((r.cross_verify_clean_count / crossVerifyKnown) * 1000) / 10
                : 0,
            hallucination_rate:
              total > 0 ? Math.round((r.hallucination_count / total) * 1000) / 10 : 0,
            regeneration_rate:
              total > 0 ? Math.round((r.regeneration_count / total) * 1000) / 10 : 0,
            avg_confidence: r.avg_confidence !== null ? Number(r.avg_confidence) : null,
            low_confidence_rate:
              confidenceKnown > 0
                ? Math.round((r.low_confidence_count / confidenceKnown) * 1000) / 10
                : 0,
            provenance_coverage:
              total > 0 ? Math.round((r.provenance_count / total) * 1000) / 10 : 0,
          };
        }
      } catch {
        // subsumio_reasoning_traces table may not exist
      }

      // ── 11. HNSW Index Check ──
      let hnsw_index_exists = false;
      try {
        const indexResult = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'content_chunks'
            AND indexdef ILIKE '%hnsw%'
          ) AS exists
        `);
        hnsw_index_exists = indexResult.rows[0]?.exists ?? false;
      } catch {
        // pg_indexes not accessible
      }

      // ── 11. Health Checks ──
      const checks: Array<{
        name: string;
        status: "ok" | "warn" | "fail";
        message: string;
        value?: number;
        threshold?: number;
      }> = [];

      checks.push({
        name: "embedding_coverage",
        status:
          embedding_coverage_pct >= 95 ? "ok" : embedding_coverage_pct >= 80 ? "warn" : "fail",
        message: `${embedding_coverage_pct.toFixed(1)}% of chunks have embeddings`,
        value: Math.round(embedding_coverage_pct * 10) / 10,
        threshold: 95,
      });

      checks.push({
        name: "stale_chunks",
        status: stale_chunks === 0 ? "ok" : stale_chunks < 100 ? "warn" : "fail",
        message: `${stale_chunks.toLocaleString()} chunks without embeddings`,
        value: stale_chunks,
        threshold: 0,
      });

      checks.push({
        name: "oversized_chunks",
        status: oversized_chunks === 0 ? "ok" : oversized_chunks < 50 ? "warn" : "fail",
        message: `${oversized_chunks} chunks exceed 6000 chars`,
        value: oversized_chunks,
        threshold: 0,
      });

      if (snapshots) {
        checks.push({
          name: "snapshot_coverage",
          status: snapshots.current > 0 ? "ok" : "warn",
          message: `${snapshots.current} current snapshots across ${snapshots.jurisdictions.length} jurisdictions`,
          value: snapshots.current,
        });
      }

      if (amendments && amendments.unresolved_stale_outputs > 0) {
        checks.push({
          name: "unresolved_stale_outputs",
          status: "warn",
          message: `${amendments.unresolved_stale_outputs} unresolved stale output(s)`,
          value: amendments.unresolved_stale_outputs,
          threshold: 0,
        });
      }

      // Chunker version mismatch check
      const currentMaxVersion = 4;
      const mismatchedPages = chunker_versions
        .filter((v) => v.version !== "unknown" && parseInt(v.version, 10) < currentMaxVersion)
        .reduce((sum, v) => sum + v.count, 0);
      if (mismatchedPages > 0) {
        checks.push({
          name: "chunker_version_mismatch",
          status: mismatchedPages < 1000 ? "warn" : "fail",
          message: `${mismatchedPages.toLocaleString()} pages with outdated chunker version (< v${currentMaxVersion})`,
          value: mismatchedPages,
          threshold: 0,
        });
      }

      if (search_telemetry && search_telemetry.avg_rank1_score !== null) {
        checks.push({
          name: "rank1_score_drift",
          status:
            search_telemetry.avg_rank1_score >= 0.5
              ? "ok"
              : search_telemetry.avg_rank1_score >= 0.3
                ? "warn"
                : "fail",
          message: `Avg rank-1 score: ${search_telemetry.avg_rank1_score.toFixed(3)}`,
          value: search_telemetry.avg_rank1_score,
          threshold: 0.5,
        });
      }

      if (hallucination) {
        checks.push({
          name: "hallucination_rate",
          status:
            hallucination.hallucination_rate <= 5
              ? "ok"
              : hallucination.hallucination_rate <= 15
                ? "warn"
                : "fail",
          message: `${hallucination.hallucination_rate.toFixed(1)}% of traces flagged as hallucinated`,
          value: hallucination.hallucination_rate,
          threshold: 5,
        });
        checks.push({
          name: "provenance_coverage",
          status:
            hallucination.provenance_coverage >= 80
              ? "ok"
              : hallucination.provenance_coverage >= 50
                ? "warn"
                : "fail",
          message: `${hallucination.provenance_coverage.toFixed(1)}% of traces have provenance links`,
          value: hallucination.provenance_coverage,
          threshold: 80,
        });
      }

      // Health score
      const fails = checks.filter((c) => c.status === "fail").length;
      const warns = checks.filter((c) => c.status === "warn").length;
      const health_score = Math.max(0, 100 - 20 * fails - 5 * warns);
      const health_status: "healthy" | "warnings" | "unhealthy" =
        fails > 0 ? "unhealthy" : warns > 0 ? "warnings" : "healthy";

      const responsePayload = {
        corpus: {
          total_pages,
          total_chunks,
          embedded_chunks,
          stale_chunks,
          embedding_coverage_pct: Math.round(embedding_coverage_pct * 10) / 10,
          orphan_pages,
          chunks_per_page: total_pages > 0 ? Math.round((total_chunks / total_pages) * 10) / 10 : 0,
        },
        embedding: {
          chunks_by_model,
          stale_chunks,
          coverage_pct: Math.round(embedding_coverage_pct * 10) / 10,
        },
        chunking: {
          chunker_versions,
          page_types,
          chunk_size_distribution,
          chunk_size_distribution_words,
          avg_chunk_chars,
          min_chunk_chars,
          max_chunk_chars,
          avg_chunk_words,
          min_chunk_words,
          max_chunk_words,
          oversized_chunks,
          undersized_chunks,
        },
        per_source,
        pages_by_source,
        chunks_by_source,
        search_telemetry,
        amendments,
        snapshots,
        hallucination,
        hnsw_index_exists,
        health: {
          score: health_score,
          status: health_status,
          checks,
        },
        generated_at: new Date().toISOString(),
      };

      try {
        await saveQualitySnapshot({
          brain_id: ctx.brainId,
          report: responsePayload,
          health_score: health_score,
          corpus_total_pages: total_pages,
          corpus_total_chunks: total_chunks,
          embedding_coverage_pct: Math.round(embedding_coverage_pct * 10) / 10,
          hallucination_rate: hallucination?.hallucination_rate ?? 0,
          guardrail_pass_rate: hallucination?.guardrail_pass_rate ?? 0,
          generated_at: responsePayload.generated_at,
        });
      } catch (snapshotErr) {
        console.error("[corpus-stats] Snapshot failed:", snapshotErr);
      }

      return apiSuccess(responsePayload);
    } catch (err) {
      console.error(
        "[corpus-stats] Failed to generate:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "internal_error",
        err instanceof Error ? err.message : "Failed to generate corpus stats",
        500
      );
    }
  }
);
