/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  env: vi.fn(() => undefined),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));

vi.mock("@/lib/engine", async () => {
  return {
    engineConfigurationResponse: () => null,
    requireEngineContext: vi.fn(),
    ENGINE_URL: "http://localhost:3001",
    engineHeadersWithCaseJurisdiction: vi.fn((ctx: any) => ctx.headers ?? {}),
  };
});

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: vi.fn(),
}));

vi.mock("@/lib/quality-snapshots", () => ({
  saveQualitySnapshot: vi.fn().mockResolvedValue({ id: "snap_1" }),
  getQualityTrends: vi.fn().mockResolvedValue([]),
}));

import { GET as corpusStatsGET } from "./corpus-stats/route";
import { GET as chunkQualityGET } from "./chunk-quality/route";
import { GET as pipelineHealthGET } from "./pipeline-health/route";
import { POST as qualitySnapshotsPOST } from "./quality-snapshots/route";
import { GET as qualityTrendsGET } from "./quality-trends/route";
import { requireEngineContext } from "@/lib/engine";
import { getSharedPgPool } from "@/lib/auth/store";
import { saveQualitySnapshot, getQualityTrends } from "@/lib/quality-snapshots";

function mockCtx(role = "admin") {
  return {
    headers: {},
    brainId: "brain_test",
    plan: "free" as const,
    user: {
      id: "user_1",
      email: "test@test.com",
      name: "Test User",
      passwordHash: "",
      role,
      plan: "free",
      locale: "de" as const,
      referralCode: "",
      referredBy: null,
      brainId: "brain_test",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
    },
  };
}

function makeRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`, { method: "GET" });
}

function mockPool(rowsByCall?: unknown[]) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation((_sql: string) => {
      const rows = rowsByCall ? (rowsByCall[callIndex++] ?? []) : [];
      return Promise.resolve({ rows });
    }),
  };
}

describe("Corpus Monitoring API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(requireEngineContext).mockResolvedValue(mockCtx() as any);
  });

  describe("GET /api/monitoring/corpus-stats", () => {
    it("returns 503 when no database pool is available", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(null);

      const res = await corpusStatsGET(makeRequest("/api/monitoring/corpus-stats"));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe("service_unavailable");
    });

    it("returns full corpus stats payload with safe defaults on empty DB", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(mockPool() as any);

      const res = await corpusStatsGET(makeRequest("/api/monitoring/corpus-stats"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeDefined();
      expect(json.data.corpus.total_pages).toBe(0);
      expect(json.data.corpus.total_chunks).toBe(0);
      expect(json.data.chunking.chunk_size_distribution).toEqual({
        undersized: 0,
        small: 0,
        optimal: 0,
        large: 0,
        oversized: 0,
      });
      expect(json.data.health.status).toBe("unhealthy");
      expect(
        json.data.health.checks.some(
          (c: any) => c.name === "embedding_coverage" && c.status === "fail"
        )
      ).toBe(true);
    });

    it("computes embedding coverage and per-source breakdown from DB rows", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(
        mockPool([
          [{ total: 100, live: 90 }],
          [{ total: 500, embedded: 450 }],
          [{ n: 5 }],
          [{ model: "openai:text-embedding-3-small", n: 450 }],
          [{ version: "4", n: 90 }],
          [{ type: "law", n: 80 }],
          [
            {
              undersized_chars: 10,
              small_chars: 50,
              optimal_chars: 100,
              large_chars: 20,
              oversized_chars: 5,
              undersized_words: 12,
              small_words: 60,
              optimal_words: 110,
              large_words: 25,
              oversized_words: 6,
              avg_chars: 1200,
              min_chars: 10,
              max_chars: 7000,
              avg_words: 250,
              min_words: 1,
              max_words: 1200,
            },
          ],
          [{ source: "law-de", pages: 40, chunks: 250, embedded: 240, stale: 10 }],
        ]) as any
      );

      const res = await corpusStatsGET(makeRequest("/api/monitoring/corpus-stats"));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.corpus.total_pages).toBe(90);
      expect(data.corpus.total_chunks).toBe(500);
      expect(data.corpus.embedding_coverage_pct).toBe(90);
      expect(data.per_source[0].coverage_pct).toBe(96);
      expect(data.chunking.avg_chunk_words).toBe(250);
    });
  });

  describe("GET /api/monitoring/chunk-quality", () => {
    it("returns type-aware re-chunk recommendations", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(
        mockPool([
          [
            { source: "law-de", version: "3", page_type: "law", page_count: 10, chunk_count: 50 },
            {
              source: "tenant",
              version: "2",
              page_type: "document",
              page_count: 5,
              chunk_count: 20,
            },
            {
              source: "law-at",
              version: "unknown",
              page_type: "statute",
              page_count: 2,
              chunk_count: 0,
            },
          ],
          [{ chunker_version: "4", undersized: 0, small: 1, optimal: 10, large: 2, oversized: 0 }],
          [],
          [],
          [],
          [],
          [],
        ]) as any
      );

      const res = await chunkQualityGET(makeRequest("/api/monitoring/chunk-quality"));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      const legalRec = data.rechunk_recommendations.find(
        (r: any) => r.source === "law-de" && r.version === "3"
      );
      expect(legalRec).toBeDefined();
      expect(legalRec.recommendation).toContain("§-aware");

      const mdRec = data.rechunk_recommendations.find(
        (r: any) => r.source === "tenant" && r.version === "2"
      );
      expect(mdRec).toBeDefined();
      expect(mdRec.recommendation).toContain("Recursive");
    });
  });

  describe("POST /api/monitoring/quality-snapshots", () => {
    it("persists a quality snapshot from the report body", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(mockPool() as any);
      vi.mocked(saveQualitySnapshot).mockResolvedValue({
        id: "snap_1",
        brain_id: "brain_test",
        report_date: "2026-07-17",
        report: { health: { score: 95 } },
      } as any);

      const req = new NextRequest("http://localhost:3000/api/monitoring/quality-snapshots", {
        method: "POST",
        body: JSON.stringify({
          report: {
            corpus: { total_pages: 100, total_chunks: 500, embedding_coverage_pct: 92 },
            hallucination: { hallucination_rate: 3.5, guardrail_pass_rate: 96 },
            health: { score: 95 },
            generated_at: new Date().toISOString(),
          },
        }),
      });

      const res = await qualitySnapshotsPOST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.snapshot.id).toBe("snap_1");
      expect(saveQualitySnapshot).toHaveBeenCalled();
    });

    it("returns 400 for invalid body", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(mockPool() as any);

      const req = new NextRequest("http://localhost:3000/api/monitoring/quality-snapshots", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await qualitySnapshotsPOST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/monitoring/quality-trends", () => {
    it("returns quality trend snapshots", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(mockPool() as any);
      vi.mocked(getQualityTrends).mockResolvedValue([
        {
          report_date: "2026-07-15",
          health_score: 92,
          embedding_coverage_pct: 90,
          hallucination_rate: 4,
          guardrail_pass_rate: 95,
        } as any,
        {
          report_date: "2026-07-16",
          health_score: 94,
          embedding_coverage_pct: 91,
          hallucination_rate: 3,
          guardrail_pass_rate: 96,
        } as any,
      ]);

      const res = await qualityTrendsGET(makeRequest("/api/monitoring/quality-trends"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.snapshots).toHaveLength(2);
      expect(json.data.snapshots[0].report_date).toBe("2026-07-16");
    });
  });

  describe("GET /api/monitoring/pipeline-health", () => {
    it("returns pipeline health even when engine is unreachable", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(
        mockPool([
          [{ active_connections: 3, idle_connections: 2, waiting_on_locks: 0 }],
          [{ exists: true }],
          [{ n: 12 }],
        ]) as any
      );

      (fetch as any).mockRejectedValue(new Error("ECONNREFUSED"));

      const res = await pipelineHealthGET(makeRequest("/api/monitoring/pipeline-health"));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.status).toBe("unhealthy");
      expect(data.engine.status).toBe("unreachable");
      expect(data.pending_embeddings).toBe(12);
      expect(data.hnsw_index_exists).toBe(true);
    });

    it("proxies engine /api/jobs/health when reachable", async () => {
      vi.mocked(getSharedPgPool).mockReturnValue(
        mockPool([
          [{ active_connections: 1, idle_connections: 0, waiting_on_locks: 0 }],
          [{ exists: true }],
          [{ n: 0 }],
        ]) as any
      );

      (fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ok",
            jobs: { pending: 4, active: 2, failed_1h: 0 },
            outbox_exhausted: 0,
            docs_failed: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

      const res = await pipelineHealthGET(makeRequest("/api/monitoring/pipeline-health"));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.status).toBe("healthy");
      expect(data.engine.jobs.pending).toBe(4);
    });
  });
});
