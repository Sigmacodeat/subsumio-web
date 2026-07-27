import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import {
  generateCorpusQualityReport,
  formatQualityReport,
  compareQualityReports,
  formatQualityTrend,
  type CorpusQualityReport,
} from "./corpus-quality-report.ts";

// ─── Mock Pool ───────────────────────────────────────────────────────────

function createMockPool(rowsByQuery: Record<string, any[]>): Pool {
  const mockQuery = vi.fn().mockImplementation((sql: string) => {
    if (
      sql.includes("FROM pages") &&
      sql.includes("deleted_at IS NULL") &&
      sql.includes("COUNT") &&
      !sql.includes("content_chunks") &&
      !sql.includes("links")
    ) {
      return Promise.resolve({ rows: rowsByQuery.pages ?? [{ live: 100, total: 120 }] });
    }
    if (sql.includes("content_chunks") && sql.includes("embedding")) {
      return Promise.resolve({ rows: rowsByQuery.chunks ?? [{ total: 500, embedded: 480 }] });
    }
    if (
      sql.includes("pages") &&
      sql.includes("source_id") &&
      sql.includes("GROUP BY") &&
      !sql.includes("content_chunks")
    ) {
      return Promise.resolve({
        rows: rowsByQuery.pagesBySource ?? [
          { source: "law-de", n: 50 },
          { source: "law-at", n: 50 },
        ],
      });
    }
    if (sql.includes("content_chunks") && sql.includes("source_id") && sql.includes("GROUP BY")) {
      return Promise.resolve({
        rows: rowsByQuery.chunksBySource ?? [
          { source: "law-de", n: 250 },
          { source: "law-at", n: 250 },
        ],
      });
    }
    if (sql.includes("COALESCE(cc.model") && sql.includes("GROUP BY")) {
      return Promise.resolve({
        rows: rowsByQuery.chunksByModel ?? [
          { model: "text-embedding-3-small", n: 480 },
          { model: "none", n: 20 },
        ],
      });
    }
    if (sql.includes("NOT EXISTS") && sql.includes("links")) {
      return Promise.resolve({ rows: rowsByQuery.orphans ?? [{ n: 5 }] });
    }
    if (sql.includes("corpus_snapshots") && sql.includes("COUNT") && sql.includes("valid_to")) {
      return Promise.resolve({
        rows: rowsByQuery.snapshots ?? [
          {
            total: 10,
            current: 7,
            superseded: 3,
            jurisdictions: ["DE", "AT", "CH"],
            oldest: "2026-01-01",
            newest: "2026-07-15",
          },
        ],
      });
    }
    if (sql.includes("stale_outputs") && sql.includes("resolved_at IS NULL")) {
      return Promise.resolve({ rows: rowsByQuery.staleOutputs ?? [{ n: 0 }] });
    }
    if (sql.includes("corpus_amendments") && sql.includes("detected_at >= $1")) {
      return Promise.resolve({ rows: rowsByQuery.amendments ?? [] });
    }
    if (sql.includes("corpus_amendments") && sql.includes("jurisdiction = $1")) {
      return Promise.resolve({ rows: rowsByQuery.amendmentsByJur ?? [] });
    }
    if (sql.includes("corpus_amendments") && sql.includes("ORDER BY detected_at DESC LIMIT")) {
      return Promise.resolve({ rows: rowsByQuery.recentAmendments ?? [] });
    }
    if (sql.includes("subsumio_reasoning_traces")) {
      return Promise.resolve({
        rows: rowsByQuery.reasoningTraces ?? [
          {
            total_traces: 0,
            guardrail_passed_count: 0,
            guardrail_known: 0,
            cross_verify_clean_count: 0,
            cross_verify_known: 0,
            hallucination_count: 0,
            regeneration_count: 0,
            avg_confidence: null,
            low_confidence_count: 0,
            confidence_known: 0,
            avg_provenance_links: null,
            provenance_count: 0,
          },
        ],
      });
    }
    return Promise.resolve({ rows: [] });
  });
  return { query: mockQuery } as unknown as Pool;
}

// ─── Sample Report ───────────────────────────────────────────────────────

function createSampleReport(
  date: string,
  overrides?: Partial<CorpusQualityReport>
): CorpusQualityReport {
  return {
    schema_version: 1,
    generated_at: `${date}T08:00:00Z`,
    report_date: date,
    corpus: {
      total_pages: 1000,
      total_chunks: 5000,
      pages_by_source: { "law-de": 500, "law-at": 500 },
      chunks_by_source: { "law-de": 2500, "law-at": 2500 },
      chunks_by_model: { "text-embedding-3-small": 4800, none: 200 },
      embedding_coverage_pct: 96.0,
      stale_chunks: 200,
      orphan_pages: 15,
    },
    search: {
      total_calls_7d: 500,
      cache_hit_rate_7d: 0.35,
      avg_results_7d: 8.5,
      avg_rank1_score: 0.65,
      rank1_distribution: { lt_solid: 10, solid: 80, high: 50 },
      intent_distribution: { legal: 400, general: 100 },
    },
    snapshots: {
      total_snapshots: 10,
      current_snapshots: 7,
      superseded_snapshots: 3,
      jurisdictions_covered: ["DE", "AT", "CH"],
      oldest_snapshot_date: "2026-01-01",
      newest_snapshot_date: "2026-07-15",
    },
    amendments: {
      total_amendments_30d: 5,
      by_change_type: { added: 1, modified: 3, removed: 1 },
      by_jurisdiction: { DE: 3, AT: 2 },
      statutes_affected: 3,
      unresolved_stale_outputs: 0,
    },
    amendment_report: null,
    hallucination: null,
    health_score: 90,
    health_status: "warnings",
    checks: [
      { name: "embedding_coverage", status: "ok", message: "96.0%", value: 96.0, threshold: 95 },
      { name: "stale_chunks", status: "warn", message: "200 chunks", value: 200, threshold: 0 },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("corpus-quality-report", () => {
  describe("generateCorpusQualityReport", () => {
    it("generates a report with all sections", async () => {
      const pool = createMockPool({});
      const report = await generateCorpusQualityReport({ pool });

      expect(report.schema_version).toBe(1);
      expect(report.generated_at).toBeTruthy();
      expect(report.report_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(report.corpus).toBeDefined();
      expect(report.snapshots).toBeDefined();
      expect(report.amendments).toBeDefined();
      expect(report.health_score).toBeGreaterThanOrEqual(0);
      expect(report.health_score).toBeLessThanOrEqual(100);
      expect(report.checks.length).toBeGreaterThan(0);
    });

    it("computes embedding coverage percentage", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 950 }],
      });
      const report = await generateCorpusQualityReport({ pool });
      expect(report.corpus.embedding_coverage_pct).toBe(95);
      expect(report.corpus.stale_chunks).toBe(50);
    });

    it("handles zero chunks gracefully", async () => {
      const pool = createMockPool({
        chunks: [{ total: 0, embedded: 0 }],
      });
      const report = await generateCorpusQualityReport({ pool });
      expect(report.corpus.embedding_coverage_pct).toBe(0);
      expect(report.corpus.stale_chunks).toBe(0);
    });

    it("flags low embedding coverage as fail", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 700 }],
      });
      const report = await generateCorpusQualityReport({ pool });
      const coverageCheck = report.checks.find((c) => c.name === "embedding_coverage");
      expect(coverageCheck).toBeDefined();
      expect(coverageCheck!.status).toBe("fail");
    });

    it("flags medium embedding coverage as warn", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 850 }],
      });
      const report = await generateCorpusQualityReport({ pool });
      const coverageCheck = report.checks.find((c) => c.name === "embedding_coverage");
      expect(coverageCheck!.status).toBe("warn");
    });

    it("passes high embedding coverage as ok", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 980 }],
      });
      const report = await generateCorpusQualityReport({ pool });
      const coverageCheck = report.checks.find((c) => c.name === "embedding_coverage");
      expect(coverageCheck!.status).toBe("ok");
    });

    it("accepts the canonical model signature with dimensions", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 1000 }],
        chunksByModel: [{ model: "openrouter:openai/text-embedding-3-small:1536", n: 1000 }],
      });
      const report = await generateCorpusQualityReport({ pool });
      expect(report.checks.find((c) => c.name === "embedding_model_consistency")).toBeUndefined();
    });

    it("flags a foreign vector model", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 1000 }],
        chunksByModel: [
          { model: "openrouter:openai/text-embedding-3-small:1536", n: 900 },
          { model: "zeroentropyai:zembed-1", n: 100 },
        ],
      });
      const report = await generateCorpusQualityReport({ pool });
      expect(report.checks.find((c) => c.name === "embedding_model_consistency")?.status).toBe(
        "fail"
      );
    });

    it("includes snapshot freshness data", async () => {
      const pool = createMockPool({
        snapshots: [
          {
            total: 20,
            current: 15,
            superseded: 5,
            jurisdictions: ["DE", "AT", "CH", "EU"],
            oldest: "2025-06-01",
            newest: "2026-07-14",
          },
        ],
      });
      const report = await generateCorpusQualityReport({ pool });
      expect(report.snapshots.total_snapshots).toBe(20);
      expect(report.snapshots.current_snapshots).toBe(15);
      expect(report.snapshots.jurisdictions_covered).toContain("EU");
    });

    it("computes health score from checks", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 600 }], // <80% → fail
        staleOutputs: [{ n: 5 }], // warn
      });
      const report = await generateCorpusQualityReport({ pool });
      // 1 fail (embedding) + at least 1 warn (stale_chunks) + 1 warn (stale_outputs)
      const fails = report.checks.filter((c) => c.status === "fail").length;
      const warns = report.checks.filter((c) => c.status === "warn").length;
      const expectedScore = Math.max(0, 100 - 20 * fails - 5 * warns);
      expect(report.health_score).toBe(expectedScore);
    });

    it("sets health_status to unhealthy when any check fails", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 500 }], // 50% → fail
      });
      const report = await generateCorpusQualityReport({ pool });
      expect(report.health_status).toBe("unhealthy");
    });

    it("sets health_status to healthy when all checks pass", async () => {
      const pool = createMockPool({
        chunks: [{ total: 1000, embedded: 1000 }], // 100% → ok, 0 stale
        staleOutputs: [{ n: 0 }], // ok
      });
      const report = await generateCorpusQualityReport({ pool });
      expect(report.health_status).toBe("healthy");
    });

    it("includes amendment summary", async () => {
      const pool = createMockPool({
        amendments: [
          {
            id: 1,
            slug: "law/de/bgb",
            statute_code: "BGB",
            jurisdiction: "DE",
            paragraph: "433",
            change_type: "modified",
            detected_at: "2026-07-15T10:00:00Z",
          },
        ],
        amendmentsByJur: [
          {
            id: 1,
            slug: "law/de/bgb",
            statute_code: "BGB",
            jurisdiction: "DE",
            paragraph: "433",
            change_type: "modified",
            detected_at: "2026-07-15T10:00:00Z",
          },
        ],
      });
      const report = await generateCorpusQualityReport({ pool });
      expect(report.amendments.total_amendments_30d).toBeGreaterThanOrEqual(0);
    });
  });

  describe("formatQualityReport", () => {
    it("includes all major sections", () => {
      const report = createSampleReport("2026-07-16");
      const text = formatQualityReport(report);
      expect(text).toContain("Corpus-Quality-Report");
      expect(text).toContain("Health Score");
      expect(text).toContain("Korpus-Statistik");
      expect(text).toContain("Search-Telemetrie");
      expect(text).toContain("Snapshot-Frische");
      expect(text).toContain("Novellen");
      expect(text).toContain("Checks");
    });

    it("shows health status icon", () => {
      const report = createSampleReport("2026-07-16", {
        health_status: "healthy",
        health_score: 100,
      });
      const text = formatQualityReport(report);
      expect(text).toContain("✅");
    });

    it("shows warning icon for warnings", () => {
      const report = createSampleReport("2026-07-16", {
        health_status: "warnings",
        health_score: 80,
      });
      const text = formatQualityReport(report);
      expect(text).toContain("⚠️");
    });

    it("shows error icon for unhealthy", () => {
      const report = createSampleReport("2026-07-16", {
        health_status: "unhealthy",
        health_score: 40,
      });
      const text = formatQualityReport(report);
      expect(text).toContain("❌");
    });

    it("handles missing search telemetry", () => {
      const report = createSampleReport("2026-07-16", { search: null });
      const text = formatQualityReport(report);
      expect(text).toContain("nicht verfügbar");
    });

    it("includes hallucination section in formatted report", () => {
      const report = createSampleReport("2026-07-16", {
        hallucination: {
          total_traces: 50,
          guardrail_pass_rate: 96,
          cross_verify_clean_rate: 92,
          hallucination_rate: 4,
          regeneration_rate: 2,
          avg_confidence: 0.78,
          low_confidence_rate: 8,
          avg_provenance_links: 3.2,
          provenance_coverage: 88,
        },
      });
      const text = formatQualityReport(report);
      expect(text).toContain("Halluzinations-Metriken");
      expect(text).toContain("Halluzinationsrate");
      expect(text).toContain("Guardrail-Pass-Rate");
      expect(text).toContain("Provenance-Abdeckung");
    });

    it("omits hallucination section when no traces", () => {
      const report = createSampleReport("2026-07-16", { hallucination: null });
      const text = formatQualityReport(report);
      expect(text).not.toContain("Halluzinations-Metriken");
    });
  });

  describe("compareQualityReports", () => {
    it("detects increases in pages", () => {
      const prev = createSampleReport("2026-07-15", {
        corpus: { ...createSampleReport("2026-07-15").corpus, total_pages: 900 },
      });
      const curr = createSampleReport("2026-07-16", {
        corpus: { ...createSampleReport("2026-07-16").corpus, total_pages: 1000 },
      });
      const trend = compareQualityReports(curr, prev);
      const pagesChange = trend.changes.find((c) => c.metric === "total_pages");
      expect(pagesChange).toBeDefined();
      expect(pagesChange!.direction).toBe("up");
      expect(pagesChange!.delta).toBe(100);
    });

    it("detects decreases in stale chunks", () => {
      const prev = createSampleReport("2026-07-15", {
        corpus: { ...createSampleReport("2026-07-15").corpus, stale_chunks: 300 },
      });
      const curr = createSampleReport("2026-07-16", {
        corpus: { ...createSampleReport("2026-07-16").corpus, stale_chunks: 200 },
      });
      const trend = compareQualityReports(curr, prev);
      const staleChange = trend.changes.find((c) => c.metric === "stale_chunks");
      expect(staleChange).toBeDefined();
      expect(staleChange!.direction).toBe("down");
      expect(staleChange!.delta).toBe(-100);
    });

    it("detects health score changes", () => {
      const prev = createSampleReport("2026-07-15", { health_score: 80 });
      const curr = createSampleReport("2026-07-16", { health_score: 90 });
      const trend = compareQualityReports(curr, prev);
      expect(trend.health_score_delta).toBe(10);
    });

    it("returns no changes when reports are identical", () => {
      const prev = createSampleReport("2026-07-15");
      const curr = createSampleReport("2026-07-16");
      // Same values, different dates
      const trend = compareQualityReports(curr, prev);
      expect(trend.changes.length).toBe(0);
    });

    it("detects search telemetry changes", () => {
      const prev = createSampleReport("2026-07-15", {
        search: { ...createSampleReport("2026-07-15").search!, total_calls_7d: 300 },
      });
      const curr = createSampleReport("2026-07-16", {
        search: { ...createSampleReport("2026-07-16").search!, total_calls_7d: 500 },
      });
      const trend = compareQualityReports(curr, prev);
      const searchChange = trend.changes.find((c) => c.metric === "search_calls_7d");
      expect(searchChange).toBeDefined();
      expect(searchChange!.delta).toBe(200);
    });

    it("handles missing search in one report", () => {
      const prev = createSampleReport("2026-07-15", { search: null });
      const curr = createSampleReport("2026-07-16");
      const trend = compareQualityReports(curr, prev);
      // search metrics should not appear since prev has no search
      expect(trend.changes.find((c) => c.metric === "search_calls_7d")).toBeUndefined();
    });

    it("detects hallucination rate changes", () => {
      const prev = createSampleReport("2026-07-15", {
        hallucination: {
          total_traces: 100,
          guardrail_pass_rate: 95,
          cross_verify_clean_rate: 90,
          hallucination_rate: 5,
          regeneration_rate: 3,
          avg_confidence: 0.75,
          low_confidence_rate: 10,
          avg_provenance_links: 3.5,
          provenance_coverage: 85,
        },
      });
      const curr = createSampleReport("2026-07-16", {
        hallucination: {
          total_traces: 120,
          guardrail_pass_rate: 92,
          cross_verify_clean_rate: 88,
          hallucination_rate: 8,
          regeneration_rate: 5,
          avg_confidence: 0.7,
          low_confidence_rate: 15,
          avg_provenance_links: 4.0,
          provenance_coverage: 90,
        },
      });
      const trend = compareQualityReports(curr, prev);
      const hallucChange = trend.changes.find((c) => c.metric === "hallucination_rate");
      expect(hallucChange).toBeDefined();
      expect(hallucChange!.direction).toBe("up");
      expect(hallucChange!.delta).toBe(3);
    });
  });

  describe("formatQualityTrend", () => {
    it("formats trend with arrows", () => {
      const prev = createSampleReport("2026-07-15", {
        corpus: { ...createSampleReport("2026-07-15").corpus, total_pages: 900, stale_chunks: 300 },
      });
      const curr = createSampleReport("2026-07-16", {
        corpus: {
          ...createSampleReport("2026-07-16").corpus,
          total_pages: 1000,
          stale_chunks: 200,
        },
      });
      const trend = compareQualityReports(curr, prev);
      const text = formatQualityTrend(trend);
      expect(text).toContain("Trend");
      expect(text).toContain("↑");
      expect(text).toContain("↓");
      expect(text).toContain("total_pages");
      expect(text).toContain("stale_chunks");
    });

    it("handles no changes", () => {
      const prev = createSampleReport("2026-07-15");
      const curr = createSampleReport("2026-07-16");
      const trend = compareQualityReports(curr, prev);
      const text = formatQualityTrend(trend);
      expect(text).toContain("Keine signifikanten Änderungen");
    });
  });
});
