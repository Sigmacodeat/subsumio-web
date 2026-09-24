/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// GET /api/admin/corpus-coverage-audit — the "pages" count must be a
// distinct page count, not the row count of a pages×content_chunks join.
// Regression test for the 2026-09-24 dashboard audit: the query used
// `count(*)` under a `LEFT JOIN content_chunks`, so a source's "pages"
// number was really its chunk count (roughly correct only for pages with
// exactly one chunk each).
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
vi.mock("@/lib/de-statute-coverage", () => ({
  fetchGiiTocCached: vi.fn().mockResolvedValue([]),
  auditDeStatutes: vi.fn().mockReturnValue([]),
  pageSlugToGiiSlug: vi.fn(),
}));

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

function get(qs = "") {
  return GET(
    new NextRequest(`http://localhost:3000/api/admin/corpus-coverage-audit?${qs}`, {
      headers: { host: "ops.subsum.io" },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR);
  vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/corpus-coverage-audit", () => {
  it("counts distinct pages, not chunk rows, under the pages×content_chunks join", async () => {
    // The SQL asserts on DISTINCT p.id — a change back to a bare count(*)
    // would slip past a mock that only checks the returned row shape, so
    // this test pins the query text itself as well as the response. The
    // route also runs an unrelated query for the DE gii-toc cross-check;
    // let that fall through untouched.
    let sawDbStatsQuery = false;
    pool.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM pages p")) {
        sawDbStatsQuery = true;
        expect(sql).toContain("count(DISTINCT p.id)");
        return {
          rows: [
            // A source with 2 pages, 5 chunks total — count(*) on the join
            // would have reported "pages: 5" here before the fix.
            { source_id: "law-at-normen", pages: 2, chunks: 5, embedded: 3, last_updated: null },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await get();
    await res.json();

    expect(res.status).toBe(200);
    expect(sawDbStatsQuery).toBe(true);
  });
});
