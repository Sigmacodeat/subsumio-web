/**
 * Corpus Quality Report — Unified Daily Quality Monitor
 *
 * Phase 9: Qualitätsmonitoring & Daily Operations
 *
 * Aggregates metrics from multiple sources into a single report:
 *   1. Corpus statistics (pages, chunks, sources, jurisdictions)
 *   2. Embedding coverage (per source, per model)
 *   3. Search telemetry (cache hit rate, avg results, rank-1 score drift)
 *   4. Amendment tracking (recent changes, stale outputs)
 *   5. Snapshot freshness (last sync, staleness class)
 *   6. Eval benchmark results (if available from last run)
 *
 * The report is designed to be:
 *   - Written to JSONL for trend tracking (one line per day)
 *   - Rendered as human-readable for dashboard/Slack
 *   - Compared against previous reports for drift detection
 *
 * @module server/src/core/legal/corpus-quality-report
 */

import type { Pool } from "pg";
import { SnapshotStore } from "./snapshot-store.ts";
import { generateAmendmentReport, type AmendmentReport } from "./amendment-report.ts";

// ─── Types ───────────────────────────────────────────────────────────────

export interface CorpusStats {
  total_pages: number;
  total_chunks: number;
  pages_by_source: Record<string, number>;
  chunks_by_source: Record<string, number>;
  chunks_by_model: Record<string, number>;
  embedding_coverage_pct: number;
  stale_chunks: number;
  orphan_pages: number;
}

export interface SearchTelemetrySummary {
  total_calls_7d: number;
  cache_hit_rate_7d: number;
  avg_results_7d: number;
  avg_rank1_score: number | null;
  rank1_distribution: { lt_solid: number; solid: number; high: number };
  intent_distribution: Record<string, number>;
}

export interface SnapshotFreshness {
  total_snapshots: number;
  current_snapshots: number;
  superseded_snapshots: number;
  jurisdictions_covered: string[];
  oldest_snapshot_date: string | null;
  newest_snapshot_date: string | null;
}

export interface AmendmentSummary {
  total_amendments_30d: number;
  by_change_type: { added: number; modified: number; removed: number };
  by_jurisdiction: Record<string, number>;
  statutes_affected: number;
  unresolved_stale_outputs: number;
}

export interface HallucinationMetrics {
  /** Total reasoning traces in the lookback window */
  total_traces: number;
  /** Percentage of traces where guardrail passed (0-100) */
  guardrail_pass_rate: number;
  /** Percentage of traces where cross-verify was clean (0-100) */
  cross_verify_clean_rate: number;
  /** Percentage of traces with any hallucination indicator (guardrail failed OR cross-verify flagged) (0-100) */
  hallucination_rate: number;
  /** Percentage of traces that required regeneration (0-100) */
  regeneration_rate: number;
  /** Average overall confidence across traces (0-1) */
  avg_confidence: number | null;
  /** Percentage of traces with confidence_level = 'low' (0-100) */
  low_confidence_rate: number;
  /** Average number of provenance links per trace (source specificity proxy) */
  avg_provenance_links: number | null;
  /** Percentage of traces with provenance links (0-100) */
  provenance_coverage: number;
}

export interface CorpusQualityReport {
  /** Report schema version */
  schema_version: 1;
  /** ISO timestamp of report generation */
  generated_at: string;
  /** Date (YYYY-MM-DD) — used as JSONL key for trend tracking */
  report_date: string;

  corpus: CorpusStats;
  search: SearchTelemetrySummary | null;
  snapshots: SnapshotFreshness;
  amendments: AmendmentSummary;
  amendment_report: AmendmentReport | null;
  hallucination: HallucinationMetrics | null;

  /** Overall health score 0-100 (100 = perfect) */
  health_score: number;
  /** Human-readable health status */
  health_status: "healthy" | "warnings" | "unhealthy";
  /** Individual check results */
  checks: QualityCheck[];
}

export interface QualityCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
  value?: number;
  threshold?: number;
}

export interface QualityReportOpts {
  /** Days to look back for amendments (default 30) */
  amendmentDays?: number;
  /** Days to look back for search telemetry (default 7) */
  telemetryDays?: number;
  /** Pool for DB queries (required) */
  pool: Pool;
  /** Optional engine for telemetry queries */
  engine?: {
    executeRaw: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  };
}

// ─── Report Generator ────────────────────────────────────────────────────

/**
 * Generate a comprehensive corpus quality report.
 *
 * Usage:
 *   const report = await generateCorpusQualityReport({ pool });
 *   // Write to JSONL for trend tracking
 *   appendFileSync("/var/log/gbrain/quality.jsonl", JSON.stringify(report) + "\n");
 *   // Or render for dashboard
 *   console.log(formatQualityReport(report));
 */
export async function generateCorpusQualityReport(
  opts: QualityReportOpts
): Promise<CorpusQualityReport> {
  const { pool, engine } = opts;
  const amendmentDays = opts.amendmentDays ?? 30;
  const telemetryDays = opts.telemetryDays ?? 7;

  const now = new Date();
  const generatedAt = now.toISOString();
  const reportDate = now.toISOString().slice(0, 10);
  const checks: QualityCheck[] = [];

  // ── 1. Corpus Statistics ──
  const corpus = await gatherCorpusStats(pool);
  checks.push({
    name: "embedding_coverage",
    status:
      corpus.embedding_coverage_pct >= 95
        ? "ok"
        : corpus.embedding_coverage_pct >= 80
          ? "warn"
          : "fail",
    message: `${corpus.embedding_coverage_pct.toFixed(1)}% of chunks have embeddings`,
    value: corpus.embedding_coverage_pct,
    threshold: 95,
  });
  checks.push({
    name: "stale_chunks",
    status: corpus.stale_chunks === 0 ? "ok" : corpus.stale_chunks < 100 ? "warn" : "fail",
    message: `${corpus.stale_chunks} chunks without embeddings`,
    value: corpus.stale_chunks,
    threshold: 0,
  });

  // Check for non-standard embedding models (e.g. legacy zembed-1)
  const STANDARD_EMBEDDING_MODELS = [
    "openrouter:openai/text-embedding-3-small",
    "openrouter:openai/text-embedding-3-small:1536",
    "text-embedding-3-small",
  ];
  const nonStandardModels = Object.entries(corpus.chunks_by_model).filter(
    ([model, count]) => count > 0 && model !== "none" && !STANDARD_EMBEDDING_MODELS.includes(model)
  );
  if (nonStandardModels.length > 0) {
    const totalNonStandard = nonStandardModels.reduce((sum, [, c]) => sum + c, 0);
    checks.push({
      name: "embedding_model_consistency",
      status: totalNonStandard < 100 ? "warn" : "fail",
      message: `${totalNonStandard} chunks with non-standard embedding models: ${nonStandardModels.map(([m, c]) => `${m}=${c}`).join(", ")}`,
      value: totalNonStandard,
      threshold: 0,
    });
  }

  // ── 2. Search Telemetry ──
  let search: SearchTelemetrySummary | null = null;
  if (engine) {
    search = await gatherSearchTelemetry(engine, telemetryDays);
    if (search) {
      checks.push({
        name: "search_volume",
        status: search.total_calls_7d > 0 ? "ok" : "warn",
        message: `${search.total_calls_7d} searches in last ${telemetryDays}d`,
        value: search.total_calls_7d,
      });
      checks.push({
        name: "cache_hit_rate",
        status:
          search.cache_hit_rate_7d >= 0.3
            ? "ok"
            : search.cache_hit_rate_7d >= 0.1
              ? "warn"
              : "fail",
        message: `${(search.cache_hit_rate_7d * 100).toFixed(1)}% cache hit rate`,
        value: search.cache_hit_rate_7d,
        threshold: 0.3,
      });
      if (search.avg_rank1_score !== null) {
        checks.push({
          name: "rank1_score_drift",
          status:
            search.avg_rank1_score >= 0.5 ? "ok" : search.avg_rank1_score >= 0.3 ? "warn" : "fail",
          message: `Avg rank-1 score: ${search.avg_rank1_score.toFixed(3)}`,
          value: search.avg_rank1_score,
          threshold: 0.5,
        });
      }
    }
  }

  // ── 3. Snapshot Freshness ──
  const snapshots = await gatherSnapshotFreshness(pool);
  checks.push({
    name: "snapshot_coverage",
    status: snapshots.current_snapshots > 0 ? "ok" : "warn",
    message: `${snapshots.current_snapshots} current snapshots across ${snapshots.jurisdictions_covered.length} jurisdictions`,
    value: snapshots.current_snapshots,
  });

  // ── 4. Amendment Summary ──
  const amendmentReport = await generateAmendmentReport(pool, {
    startDate: new Date(Date.now() - amendmentDays * 86_400_000).toISOString(),
  });

  const amendmentSummary: AmendmentSummary = {
    total_amendments_30d: amendmentReport.total_amendments,
    by_change_type: amendmentReport.by_change_type,
    by_jurisdiction: Object.fromEntries(
      Object.entries(amendmentReport.by_jurisdiction).map(([k, v]) => [k, v.total])
    ),
    statutes_affected: amendmentReport.changed_slugs.length,
    unresolved_stale_outputs: await countUnresolvedStaleOutputs(pool),
  };

  checks.push({
    name: "unresolved_stale_outputs",
    status: amendmentSummary.unresolved_stale_outputs === 0 ? "ok" : "warn",
    message: `${amendmentSummary.unresolved_stale_outputs} unresolved stale output(s)`,
    value: amendmentSummary.unresolved_stale_outputs,
    threshold: 0,
  });

  // ── 5. Hallucination Metrics (from reasoning traces) ──
  const hallucination = await gatherHallucinationMetrics(pool, telemetryDays);
  if (hallucination && hallucination.total_traces > 0) {
    checks.push({
      name: "hallucination_rate",
      status:
        hallucination.hallucination_rate <= 5
          ? "ok"
          : hallucination.hallucination_rate <= 15
            ? "warn"
            : "fail",
      message: `${hallucination.hallucination_rate.toFixed(1)}% hallucination rate (${hallucination.total_traces} traces)`,
      value: hallucination.hallucination_rate,
      threshold: 5,
    });
    checks.push({
      name: "guardrail_pass_rate",
      status:
        hallucination.guardrail_pass_rate >= 95
          ? "ok"
          : hallucination.guardrail_pass_rate >= 80
            ? "warn"
            : "fail",
      message: `${hallucination.guardrail_pass_rate.toFixed(1)}% guardrail pass rate`,
      value: hallucination.guardrail_pass_rate,
      threshold: 95,
    });
    if (hallucination.avg_confidence !== null) {
      checks.push({
        name: "avg_confidence",
        status:
          hallucination.avg_confidence >= 0.7
            ? "ok"
            : hallucination.avg_confidence >= 0.5
              ? "warn"
              : "fail",
        message: `Avg confidence: ${hallucination.avg_confidence.toFixed(2)}`,
        value: hallucination.avg_confidence,
        threshold: 0.7,
      });
    }
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

  // ── Health Score ──
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const healthScore = Math.max(0, 100 - 20 * fails - 5 * warns);
  const healthStatus: CorpusQualityReport["health_status"] =
    fails > 0 ? "unhealthy" : warns > 0 ? "warnings" : "healthy";

  return {
    schema_version: 1,
    generated_at: generatedAt,
    report_date: reportDate,
    corpus,
    search,
    snapshots,
    amendments: amendmentSummary,
    amendment_report: amendmentReport,
    hallucination,
    health_score: healthScore,
    health_status: healthStatus,
    checks,
  };
}

// ─── Data Gatherers ──────────────────────────────────────────────────────

async function gatherCorpusStats(pool: Pool): Promise<CorpusStats> {
  // Total pages and chunks
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

  // Pages by source
  const pagesBySourceResult = await pool.query(`
    SELECT COALESCE(source_id, 'default') AS source, COUNT(*)::int AS n
    FROM pages WHERE deleted_at IS NULL
    GROUP BY source_id ORDER BY n DESC
  `);
  const pages_by_source: Record<string, number> = {};
  for (const r of pagesBySourceResult.rows) {
    pages_by_source[r.source] = r.n;
  }

  // Chunks by source
  const chunksBySourceResult = await pool.query(`
    SELECT COALESCE(p.source_id, 'default') AS source, COUNT(*)::int AS n
    FROM content_chunks cc
    JOIN pages p ON p.id = cc.page_id
    WHERE p.deleted_at IS NULL
    GROUP BY p.source_id ORDER BY n DESC
  `);
  const chunks_by_source: Record<string, number> = {};
  for (const r of chunksBySourceResult.rows) {
    chunks_by_source[r.source] = r.n;
  }

  // Chunks by embedding model
  const chunksByModelResult = await pool.query(`
    SELECT COALESCE(cc.model, 'none') AS model, COUNT(*)::int AS n
    FROM content_chunks cc
    JOIN pages p ON p.id = cc.page_id
    WHERE p.deleted_at IS NULL
    GROUP BY cc.model ORDER BY n DESC
  `);
  const chunks_by_model: Record<string, number> = {};
  for (const r of chunksByModelResult.rows) {
    chunks_by_model[r.model] = r.n;
  }

  // Orphan pages (pages with no inbound links)
  const orphanResult = await pool.query(`
    SELECT COUNT(*)::int AS n FROM pages p
    WHERE p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM links l WHERE l.to_page_id = p.id
      )
  `);
  const orphan_pages = orphanResult.rows[0]?.n ?? 0;

  return {
    total_pages,
    total_chunks,
    pages_by_source,
    chunks_by_source,
    chunks_by_model,
    embedding_coverage_pct,
    stale_chunks,
    orphan_pages,
  };
}

async function gatherSearchTelemetry(
  engine: NonNullable<QualityReportOpts["engine"]>,
  days: number
): Promise<SearchTelemetrySummary | null> {
  try {
    const cutoffDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const rows = await engine.executeRaw<{
      total_calls: number;
      cache_hits: number;
      cache_misses: number;
      sum_results: number;
      sum_rank1_score: number;
      count_rank1: number;
      rank1_lt_solid: number;
      rank1_solid: number;
      rank1_high: number;
    }>(
      `SELECT
         SUM(count)::int AS total_calls,
         SUM(cache_hit)::int AS cache_hits,
         SUM(cache_miss)::int AS cache_misses,
         SUM(sum_results)::int AS sum_results,
         SUM(sum_rank1_score)::float AS sum_rank1_score,
         SUM(count_rank1)::int AS count_rank1,
         SUM(rank1_lt_solid)::int AS rank1_lt_solid,
         SUM(rank1_solid)::int AS rank1_solid,
         SUM(rank1_high)::int AS rank1_high
       FROM search_telemetry
       WHERE date >= ($1)::text`,
      [cutoffDate]
    );

    if (!rows[0] || !rows[0].total_calls) return null;

    const r = rows[0];
    const total_calls = r.total_calls;
    const cache_hit_rate = total_calls > 0 ? r.cache_hits / total_calls : 0;
    const avg_results = total_calls > 0 ? r.sum_results / total_calls : 0;
    const avg_rank1_score = r.count_rank1 > 0 ? r.sum_rank1_score / r.count_rank1 : null;

    // Intent distribution
    const intentRows = await engine.executeRaw<{ intent: string; count: number }>(
      `SELECT intent, SUM(count)::int AS count
       FROM search_telemetry
       WHERE date >= ($1)::text
       GROUP BY intent ORDER BY count DESC`,
      [cutoffDate]
    );
    const intent_distribution: Record<string, number> = {};
    for (const ir of intentRows) {
      intent_distribution[ir.intent] = ir.count;
    }

    return {
      total_calls_7d: total_calls,
      cache_hit_rate_7d: cache_hit_rate,
      avg_results_7d: avg_results,
      avg_rank1_score: avg_rank1_score ?? null,
      rank1_distribution: {
        lt_solid: r.rank1_lt_solid,
        solid: r.rank1_solid,
        high: r.rank1_high,
      },
      intent_distribution,
    };
  } catch {
    // search_telemetry table may not exist or engine may not support it
    return null;
  }
}

async function gatherSnapshotFreshness(pool: Pool): Promise<SnapshotFreshness> {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE valid_to IS NULL)::int AS current,
      COUNT(*) FILTER (WHERE valid_to IS NOT NULL)::int AS superseded,
      ARRAY_AGG(DISTINCT jurisdiction) AS jurisdictions,
      MIN(valid_from)::text AS oldest,
      MAX(valid_from)::text AS newest
    FROM corpus_snapshots
  `);
  const r = result.rows[0] ?? {};
  return {
    total_snapshots: r.total ?? 0,
    current_snapshots: r.current ?? 0,
    superseded_snapshots: r.superseded ?? 0,
    jurisdictions_covered: (r.jurisdictions as string[]) ?? [],
    oldest_snapshot_date: r.oldest ?? null,
    newest_snapshot_date: r.newest ?? null,
  };
}

async function countUnresolvedStaleOutputs(pool: Pool): Promise<number> {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS n FROM stale_outputs WHERE resolved_at IS NULL
  `);
  return result.rows[0]?.n ?? 0;
}

async function gatherHallucinationMetrics(
  pool: Pool,
  days: number
): Promise<HallucinationMetrics | null> {
  try {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    const result = await pool.query<{
      total_traces: number;
      guardrail_passed_count: number;
      guardrail_known: number;
      cross_verify_clean_count: number;
      cross_verify_known: number;
      hallucination_count: number;
      regeneration_count: number;
      avg_confidence: number | null;
      low_confidence_count: number;
      confidence_known: number;
      avg_provenance_links: number | null;
      provenance_count: number;
    }>(
      `SELECT
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
         AVG(jsonb_array_length(provenance_links)) FILTER (WHERE provenance_links IS NOT NULL AND jsonb_typeof(provenance_links) = 'array') AS avg_provenance_links,
         COUNT(*) FILTER (WHERE provenance_links IS NOT NULL AND jsonb_typeof(provenance_links) = 'array' AND jsonb_array_length(provenance_links) > 0)::int AS provenance_count
       FROM subsumio_reasoning_traces
       WHERE timestamp >= $1`,
      [cutoff]
    );

    const r = result.rows[0];
    if (!r || r.total_traces === 0) return null;

    const total = r.total_traces;
    const guardrailKnown = r.guardrail_known || total;
    const crossVerifyKnown = r.cross_verify_known || total;
    const confidenceKnown = r.confidence_known || total;

    return {
      total_traces: total,
      guardrail_pass_rate:
        guardrailKnown > 0 ? (r.guardrail_passed_count / guardrailKnown) * 100 : 0,
      cross_verify_clean_rate:
        crossVerifyKnown > 0 ? (r.cross_verify_clean_count / crossVerifyKnown) * 100 : 0,
      hallucination_rate: total > 0 ? (r.hallucination_count / total) * 100 : 0,
      regeneration_rate: total > 0 ? (r.regeneration_count / total) * 100 : 0,
      avg_confidence: r.avg_confidence !== null ? Number(r.avg_confidence) : null,
      low_confidence_rate:
        confidenceKnown > 0 ? (r.low_confidence_count / confidenceKnown) * 100 : 0,
      avg_provenance_links: r.avg_provenance_links !== null ? Number(r.avg_provenance_links) : null,
      provenance_coverage: total > 0 ? (r.provenance_count / total) * 100 : 0,
    };
  } catch {
    return null;
  }
}

// ─── Formatting ──────────────────────────────────────────────────────────

/**
 * Format a corpus quality report as a human-readable summary (German).
 */
export function formatQualityReport(report: CorpusQualityReport): string {
  const lines: string[] = [];
  const statusIcon =
    report.health_status === "healthy" ? "✅" : report.health_status === "warnings" ? "⚠️" : "❌";

  lines.push(`${statusIcon} Corpus-Quality-Report — ${report.report_date}`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(`Health Score: ${report.health_score}/100 (${report.health_status})`);
  lines.push("");

  // Corpus stats
  lines.push("Korpus-Statistik:");
  lines.push(`  Seiten: ${report.corpus.total_pages.toLocaleString()}`);
  lines.push(`  Chunks: ${report.corpus.total_chunks.toLocaleString()}`);
  lines.push(`  Embedding-Abdeckung: ${report.corpus.embedding_coverage_pct.toFixed(1)}%`);
  if (report.corpus.stale_chunks > 0) {
    lines.push(`  ⚠ ${report.corpus.stale_chunks.toLocaleString()} Chunks ohne Embedding`);
  }
  lines.push(`  Orphan-Seiten: ${report.corpus.orphan_pages.toLocaleString()}`);
  const topSources = Object.entries(report.corpus.pages_by_source).slice(0, 5);
  if (topSources.length > 0) {
    lines.push(`  Top-Quellen: ${topSources.map(([s, n]) => `${s}=${n}`).join(", ")}`);
  }
  lines.push("");

  // Embedding models
  const models = Object.entries(report.corpus.chunks_by_model);
  if (models.length > 0) {
    lines.push("Embedding-Modelle:");
    for (const [model, count] of models) {
      lines.push(`  ${model}: ${count.toLocaleString()} Chunks`);
    }
    lines.push("");
  }

  // Search telemetry
  if (report.search) {
    const s = report.search;
    lines.push("Search-Telemetrie (7 Tage):");
    lines.push(`  Aufrufe: ${s.total_calls_7d.toLocaleString()}`);
    lines.push(`  Cache-Hit-Rate: ${(s.cache_hit_rate_7d * 100).toFixed(1)}%`);
    lines.push(`  Ø Ergebnisse: ${s.avg_results_7d.toFixed(1)}`);
    if (s.avg_rank1_score !== null) {
      lines.push(`  Ø Rank-1-Score: ${s.avg_rank1_score.toFixed(3)}`);
    }
    lines.push("");
  } else {
    lines.push("Search-Telemetrie: nicht verfügbar");
    lines.push("");
  }

  // Snapshots
  lines.push("Snapshot-Frische:");
  lines.push(`  Aktuell: ${report.snapshots.current_snapshots}`);
  lines.push(`  Historisch: ${report.snapshots.superseded_snapshots}`);
  lines.push(`  Jurisdiktionen: ${report.snapshots.jurisdictions_covered.join(", ") || "keine"}`);
  if (report.snapshots.newest_snapshot_date) {
    lines.push(`  Neueste: ${report.snapshots.newest_snapshot_date.slice(0, 10)}`);
  }
  lines.push("");

  // Amendments
  lines.push(`Novellen (30 Tage):`);
  lines.push(`  Gesamt: ${report.amendments.total_amendments_30d}`);
  lines.push(`  Geändert: ${report.amendments.by_change_type.modified}`);
  lines.push(`  Neu: ${report.amendments.by_change_type.added}`);
  lines.push(`  Entfernt: ${report.amendments.by_change_type.removed}`);
  lines.push(`  Betroffene Gesetze: ${report.amendments.statutes_affected}`);
  if (report.amendments.unresolved_stale_outputs > 0) {
    lines.push(`  ⚠ ${report.amendments.unresolved_stale_outputs} ungeprüfte stale Outputs`);
  }
  lines.push("");

  // Hallucination metrics
  if (report.hallucination && report.hallucination.total_traces > 0) {
    const h = report.hallucination;
    lines.push(`Halluzinations-Metriken (${h.total_traces} Traces):`);
    lines.push(`  Halluzinationsrate: ${h.hallucination_rate.toFixed(1)}%`);
    lines.push(`  Guardrail-Pass-Rate: ${h.guardrail_pass_rate.toFixed(1)}%`);
    lines.push(`  Cross-Verify-Clean-Rate: ${h.cross_verify_clean_rate.toFixed(1)}%`);
    lines.push(`  Regenerationsrate: ${h.regeneration_rate.toFixed(1)}%`);
    if (h.avg_confidence !== null) {
      lines.push(`  Ø Confidence: ${h.avg_confidence.toFixed(2)}`);
    }
    lines.push(`  Low-Confidence-Rate: ${h.low_confidence_rate.toFixed(1)}%`);
    if (h.avg_provenance_links !== null) {
      lines.push(`  Ø Provenance-Links: ${h.avg_provenance_links.toFixed(1)}`);
    }
    lines.push(`  Provenance-Abdeckung: ${h.provenance_coverage.toFixed(1)}%`);
    lines.push("");
  }

  // Checks
  if (report.checks.length > 0) {
    lines.push("Checks:");
    for (const c of report.checks) {
      const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "✗";
      lines.push(`  ${icon} ${c.name}: ${c.message}`);
    }
  }

  return lines.join("\n");
}

// ─── Trend Comparison ────────────────────────────────────────────────────

/**
 * Compare two quality reports and highlight significant changes.
 */
export interface QualityTrend {
  report_date: string;
  previous_date: string;
  health_score_delta: number;
  changes: Array<{
    metric: string;
    previous: number;
    current: number;
    delta: number;
    direction: "up" | "down" | "stable";
  }>;
}

export function compareQualityReports(
  current: CorpusQualityReport,
  previous: CorpusQualityReport
): QualityTrend {
  const changes: QualityTrend["changes"] = [];

  const metrics: Array<{ name: string; prev: number; curr: number }> = [
    { name: "total_pages", prev: previous.corpus.total_pages, curr: current.corpus.total_pages },
    { name: "total_chunks", prev: previous.corpus.total_chunks, curr: current.corpus.total_chunks },
    {
      name: "embedding_coverage_pct",
      prev: previous.corpus.embedding_coverage_pct,
      curr: current.corpus.embedding_coverage_pct,
    },
    { name: "stale_chunks", prev: previous.corpus.stale_chunks, curr: current.corpus.stale_chunks },
    { name: "orphan_pages", prev: previous.corpus.orphan_pages, curr: current.corpus.orphan_pages },
    { name: "health_score", prev: previous.health_score, curr: current.health_score },
  ];

  if (current.search && previous.search) {
    metrics.push(
      {
        name: "search_calls_7d",
        prev: previous.search.total_calls_7d,
        curr: current.search.total_calls_7d,
      },
      {
        name: "cache_hit_rate",
        prev: previous.search.cache_hit_rate_7d * 100,
        curr: current.search.cache_hit_rate_7d * 100,
      }
    );
    if (current.search.avg_rank1_score !== null && previous.search.avg_rank1_score !== null) {
      metrics.push({
        name: "avg_rank1_score",
        prev: previous.search.avg_rank1_score,
        curr: current.search.avg_rank1_score,
      });
    }
  }

  metrics.push(
    {
      name: "amendments_30d",
      prev: previous.amendments.total_amendments_30d,
      curr: current.amendments.total_amendments_30d,
    },
    {
      name: "stale_outputs",
      prev: previous.amendments.unresolved_stale_outputs,
      curr: current.amendments.unresolved_stale_outputs,
    }
  );

  if (current.hallucination && previous.hallucination) {
    metrics.push(
      {
        name: "hallucination_rate",
        prev: previous.hallucination.hallucination_rate,
        curr: current.hallucination.hallucination_rate,
      },
      {
        name: "guardrail_pass_rate",
        prev: previous.hallucination.guardrail_pass_rate,
        curr: current.hallucination.guardrail_pass_rate,
      },
      {
        name: "total_traces",
        prev: previous.hallucination.total_traces,
        curr: current.hallucination.total_traces,
      },
      {
        name: "provenance_coverage",
        prev: previous.hallucination.provenance_coverage,
        curr: current.hallucination.provenance_coverage,
      }
    );
    if (
      current.hallucination.avg_confidence !== null &&
      previous.hallucination.avg_confidence !== null
    ) {
      metrics.push({
        name: "avg_confidence",
        prev: previous.hallucination.avg_confidence,
        curr: current.hallucination.avg_confidence,
      });
    }
  }

  for (const m of metrics) {
    const delta = m.curr - m.prev;
    if (delta === 0) continue;
    changes.push({
      metric: m.name,
      previous: m.prev,
      current: m.curr,
      delta,
      direction: delta > 0 ? "up" : "down",
    });
  }

  return {
    report_date: current.report_date,
    previous_date: previous.report_date,
    health_score_delta: current.health_score - previous.health_score,
    changes,
  };
}

/**
 * Format a quality trend as human-readable text (German).
 */
export function formatQualityTrend(trend: QualityTrend): string {
  const lines: string[] = [];
  lines.push(`Trend ${trend.previous_date} → ${trend.report_date}`);
  lines.push(`${"=".repeat(40)}`);

  const scoreIcon = trend.health_score_delta > 0 ? "↑" : trend.health_score_delta < 0 ? "↓" : "→";
  lines.push(
    `Health Score: ${trend.health_score_delta > 0 ? "+" : ""}${trend.health_score_delta} ${scoreIcon}`
  );
  lines.push("");

  if (trend.changes.length === 0) {
    lines.push("Keine signifikanten Änderungen.");
  } else {
    for (const c of trend.changes) {
      const arrow = c.direction === "up" ? "↑" : "↓";
      const sign = c.delta > 0 ? "+" : "";
      const formatted =
        c.metric.includes("pct") || c.metric.includes("rate") || c.metric.includes("score")
          ? `${sign}${c.delta.toFixed(1)}`
          : `${sign}${c.delta.toLocaleString()}`;
      lines.push(
        `  ${arrow} ${c.metric}: ${c.previous.toLocaleString()} → ${c.current.toLocaleString()} (${formatted})`
      );
    }
  }

  return lines.join("\n");
}
