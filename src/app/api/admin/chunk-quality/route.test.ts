/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// GET /api/admin/chunk-quality — reads the 10-minute quality snapshot (one
// row), never aggregates the corpus live. Before 2026-09-24 this route ran
// three full-corpus queries per request, one of them the pages×chunks join
// with AVG(length(chunk_text)), and the tab refetched it every 5 s.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));
vi.mock("@/lib/auth/api-key-auth", () => ({ verifyApiKey: vi.fn().mockResolvedValue(null) }));

const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => pool }));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";

const OPERATOR = "ops@subsumio.example";

function ctx(email: string) {
  return {
    headers: {},
    brainId: "brain",
    plan: "team",
    user: {
      id: "u1",
      email,
      role: "admin",
      twoFactorEnabled: true,
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function get() {
  return GET(
    new NextRequest("http://localhost:3000/api/admin/chunk-quality", {
      headers: { host: "ops.subsum.io" },
    })
  );
}

const SNAPSHOT = {
  totalChunks: 4000,
  embeddedChunks: 250,
  embeddingCoveragePct: 6.3,
  avgLength: 1600,
  roleDistribution: [{ role: "full", count: 3000 }],
  lengthHistogram: [{ bucket: "optimal", label: "500–1500", count: 1000 }],
  perSource: [
    {
      source: "law-at-normen",
      pages: 100,
      chunks: 1000,
      embedded: 250,
      coveragePct: 25,
      avgLength: 400,
    },
  ],
  sampledChunks: 40,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR);
  vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/chunk-quality", () => {
  it("serves the latest snapshot and its time, without any live aggregation", async () => {
    const seen: string[] = [];
    pool.query.mockImplementation(async (sql: string) => {
      seen.push(sql);
      if (sql.includes("corpus_quality_snapshot"))
        return { rows: [{ payload: SNAPSHOT, measured_at: "2026-09-24T08:10:19.000Z" }] };
      return { rows: [] };
    });
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.dbAvailable).toBe(true);
    expect(body.data.snapshotAt).toBe("2026-09-24T08:10:19.000Z");
    expect(body.data.generatedAt).toBe("2026-09-24T08:10:19.000Z");
    expect(body.data.totalChunks).toBe(4000);
    expect(body.data.perSource[0].source).toBe("law-at-normen");
    expect(seen).toHaveLength(1);
    expect(seen.some((s) => /content_chunks|length\(|TABLESAMPLE/.test(s))).toBe(false);
  });

  it("reports dbAvailable=false with empty data before the first snapshot", async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const body = await (await get()).json();
    expect(body.data.dbAvailable).toBe(false);
    expect(body.data.snapshotAt).toBeNull();
    expect(body.data.totalChunks).toBe(0);
    expect(body.data.perSource).toEqual([]);
  });

  it("reports dbAvailable=false (200) when the snapshot read throws", async () => {
    pool.query.mockRejectedValue(new Error("connection terminated unexpectedly"));
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dbAvailable).toBe(false);
    expect(body.data.snapshotAt).toBeNull();
  });
});
