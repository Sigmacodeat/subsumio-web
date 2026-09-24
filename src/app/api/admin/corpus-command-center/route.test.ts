/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// GET /api/admin/corpus-command-center — `dbAvailable` must reflect whether
// the DB stats query actually succeeded, not just whether a pool object
// exists. Regression test for the 2026-09-24 dashboard audit: dbAvailable
// was set to `true` as soon as `pool` was truthy, before the query ran —
// so a failed or timed-out stats query still reported dbAvailable: true,
// and the frontend's "DB nicht erreichbar" warning never showed even
// though every source's numbers were silently 0.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
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
    user: { id: "u1", email, role: "admin", twoFactorEnabled: true },
  };
}

function get() {
  return GET(
    new NextRequest("http://localhost:3000/api/admin/corpus-command-center", {
      headers: { host: "ops.subsum.io" },
    })
  );
}

/** Every query the route makes when a pool exists, keyed by a distinguishing
 *  substring, so a test only has to override the one it cares about. */
function baseQueryRouter(overrides: Record<string, () => any> = {}) {
  return async (sql: string) => {
    for (const [needle, fn] of Object.entries(overrides)) {
      if (sql.includes(needle)) return fn();
    }
    if (sql.includes("FROM pages p")) return { rows: [] };
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
  it("dbAvailable is true when the stats query actually succeeds", async () => {
    pool.query.mockImplementation(baseQueryRouter());
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.dbAvailable).toBe(true);
  });

  it("dbAvailable is false when the stats query throws, and the response still succeeds", async () => {
    pool.query.mockImplementation(
      baseQueryRouter({
        "FROM pages p": () => {
          throw new Error("connection terminated unexpectedly");
        },
      })
    );
    const res = await get();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.dbAvailable).toBe(false);
    // No source ever got real numbers, but the route must not crash — it
    // degrades to an empty sync table, which the frontend renders behind
    // the "DB nicht erreichbar" banner (see corpus-command-center.tsx).
    expect(body.data.sync.rows).toEqual([]);
  });
});
