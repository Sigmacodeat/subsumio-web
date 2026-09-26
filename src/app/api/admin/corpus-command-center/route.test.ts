/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// GET /api/admin/corpus-command-center — the DB numbers come from the
// 10-minute inventory snapshot, not a live pages×chunks join, and
// `dbAvailable` reflects whether that snapshot was actually read.
//
// Regression tests for the 2026-09-24 dashboard audit: (1) the live join
// took 38 s on prod and this route is polled every few seconds while
// anything runs, which made the whole page unusable; (2) dbAvailable was
// set to true as soon as a pool object existed, before any query ran, so a
// failed query still reported the DB as available and every source
// silently showed 0 instead of the already-built "nicht erreichbar" banner.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { NextRequest } from "next/server";

// A tmpdir that is never created: listCorpusNames()/getCorpusIndex() and the
// route's own existsSync() checks all resolve to "nothing here", so the
// per-corpus disk-scan loop is a no-op and the test only has to deal with
// the pool.query calls. vi.hoisted: vi.mock factories (and modules they
// trigger at import time, like corpus-index.ts) run before plain top-level
// imports/consts are set up, so even node:fs/node:os must be loaded inside it.
const ROOT = await vi.hoisted(async () => {
  const { realpathSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return `${realpathSync(tmpdir())}/command-center-route-test-${process.pid}-${Date.now()}`;
});

vi.mock("@/lib/corpus-paths", () => ({
  lawCorpusDir: () => ROOT,
  lawCorpusNormalizedDir: () => `${ROOT}/_normalized`,
  lawCorpusSplitDir: () => `${ROOT}/split`,
}));
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
    new NextRequest("http://localhost:3000/api/admin/corpus-command-center", {
      headers: { host: "ops.subsum.io" },
    })
  );
}

function snapshotRow(source_id: string, measured_at: string, extra: Record<string, unknown> = {}) {
  return {
    source_id,
    kind: "statute",
    pages: 100,
    documents: 10,
    statutes: 1,
    rechtssaetze: 0,
    texte: 0,
    repealed: 0,
    chunks: 300,
    embedded: 150,
    last_updated: "2026-09-24T05:00:00.000Z",
    measured_at,
    ...extra,
  };
}

/** Every query the route makes when a pool exists, keyed by a distinguishing
 *  substring, so a test only has to override the one it cares about. */
function baseQueryRouter(overrides: Record<string, () => any> = {}) {
  return async (sql: string) => {
    for (const [needle, fn] of Object.entries(overrides)) {
      if (sql.includes(needle)) return fn();
    }
    if (sql.includes("corpus_inventory_snapshot")) {
      return {
        rows: [
          snapshotRow("law-at", "2026-09-24T05:00:00.000Z"),
          snapshotRow("law-at-normen", "2026-09-24T05:10:00.000Z"),
        ],
      };
    }
    // The live heartbeat: last write per source within 15 minutes.
    if (sql.includes("interval '15 minutes'"))
      return { rows: [{ source_id: "law-at-normen", last_write: "2026-09-24T05:14:00.000Z" }] };
    if (sql.includes("FROM pipeline_state")) return { rows: [] };
    if (sql.includes("FROM ris_lock")) return { rows: [] };
    if (sql.includes("FROM pipeline_config WHERE key = 'paused'")) return { rows: [] };
    if (sql.includes("delta_sync_triggered")) return { rows: [] };
    return { rows: [] };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR);
  vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
});

afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("GET /api/admin/corpus-command-center", () => {
  it("reads the DB numbers from the inventory snapshot, never from a live pages×chunks join", async () => {
    const seen: string[] = [];
    pool.query.mockImplementation(async (sql: string) => {
      seen.push(sql);
      return baseQueryRouter()(sql);
    });
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.dbAvailable).toBe(true);
    // The snapshot time is the newest across sources, not the first row's.
    expect(body.data.snapshotAt).toBe("2026-09-24T05:10:00.000Z");
    // The 38-second query must be gone for good.
    expect(seen.some((s) => s.includes("LEFT JOIN content_chunks"))).toBe(false);
    expect(seen.some((s) => s.includes("corpus_inventory_snapshot"))).toBe(true);
  });

  it("builds sync rows from the document-number inventory, embeddings from the snapshot", async () => {
    // The table no longer counts files or import file names itself: the
    // hourly corpus-sync-inventory measurement is the only source of the
    // RIS/Server/DB numbers (audit 2026-09-25).
    mkdirSync(`${ROOT}/_state`, { recursive: true });
    writeFileSync(
      `${ROOT}/_state/corpus-sync-inventory.json`,
      JSON.stringify({
        version: 1,
        measuredAt: "2026-09-25T10:00:00.000Z",
        durationMs: 1000,
        sources: [
          {
            corpus: "at-normen",
            sourceId: "law-at-normen",
            inScope: true,
            historical: false,
            risSoll: 148157,
            risSollKind: "index",
            diskDocs: 147774,
            dbDocs: 147700,
            dbPages: 147700,
            missingOnDisk: 383,
            missingByReason: { open: 383, no_text: 0, not_found: 0, failed: 0 },
            diskNotInDb: 74,
            dbNotOnDisk: 0,
            notInRisSoll: 2240,
          },
        ],
      })
    );
    try {
      pool.query.mockImplementation(baseQueryRouter());
      const body = await (await get()).json();
      expect(body.data.sync.measuredAt).toBe("2026-09-25T10:00:00.000Z");
      const normen = body.data.sync.rows.find((r: any) => r.sourceId === "law-at-normen");
      expect(normen).toMatchObject({
        risSoll: 148157,
        diskDocs: 147774,
        dbDocs: 147700,
        missingOpen: 383,
        importOpen: 74,
        notInSoll: 2240,
        status: "fetch_open",
        pipelineKey: "normen-at",
        // From the snapshot row for law-at-normen.
        dbChunks: 300,
        embeddedChunks: 150,
      });
      expect(body.data.sync.totals.missingOpen).toBe(383);
    } finally {
      rmSync(`${ROOT}/_state`, { recursive: true, force: true });
    }
  });

  it("dbAvailable is false when the snapshot read throws, and the response still succeeds", async () => {
    pool.query.mockImplementation(
      baseQueryRouter({
        corpus_inventory_snapshot: () => {
          throw new Error("connection terminated unexpectedly");
        },
      })
    );
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.dbAvailable).toBe(false);
    expect(body.data.snapshotAt).toBeNull();
    // No inventory measurement exists here either — the route must not
    // crash; the frontend shows "Noch keine Messung" instead of numbers.
    expect(body.data.sync.rows).toEqual([]);
    expect(body.data.sync.measuredAt).toBeNull();
  });

  it("dbAvailable is false when no snapshot exists yet (fresh install)", async () => {
    pool.query.mockImplementation(
      baseQueryRouter({ corpus_inventory_snapshot: () => ({ rows: [] }) })
    );
    const body = await (await get()).json();
    expect(body.data.dbAvailable).toBe(false);
    expect(body.data.snapshotAt).toBeNull();
  });
});
