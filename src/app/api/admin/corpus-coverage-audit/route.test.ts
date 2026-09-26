/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// GET /api/admin/corpus-coverage-audit — reads the per-source numbers from
// the 10-minute inventory snapshot, not a live pages×chunks join.
//
// History (2026-09-24 dashboard audit): the live query first counted
// `count(*)` under a LEFT JOIN content_chunks, so "Seiten" was really the
// chunk count; then, even corrected, it took 17 s per open of the Bestand
// tab. The snapshot answers in milliseconds and is the same source every
// other panel uses.
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
    user: {
      id: "u1",
      email,
      role: "admin",
      twoFactorEnabled: true,
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function get(qs = "jurisdiction=AT") {
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
  it("takes pages/chunks/embedded from the snapshot and reports its time", async () => {
    const seen: string[] = [];
    pool.query.mockImplementation(async (sql: string) => {
      seen.push(sql);
      if (sql.includes("corpus_inventory_snapshot")) {
        return {
          rows: [
            {
              source_id: "law-at-normen",
              kind: "statute",
              pages: 2,
              documents: 1,
              statutes: 1,
              rechtssaetze: 0,
              texte: 0,
              repealed: 0,
              chunks: 5,
              embedded: 3,
              last_updated: "2026-09-24T05:00:00.000Z",
              measured_at: "2026-09-24T05:10:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.snapshot_at).toBe("2026-09-24T05:10:00.000Z");
    // A page with 5 chunks is one page, not five — whether the source is
    // declared in the coverage matrix (rows, summed over db_source_ids) or
    // shows up as undeclared.
    const declared = body.data.rows.find((r: any) => r.db_source_ids?.includes("law-at-normen"));
    const undeclared = body.data.undeclared.find((s: any) => s.source_id === "law-at-normen");
    expect(declared?.actual_pages ?? undeclared?.pages).toBe(2);
    expect(seen.some((s) => s.includes("LEFT JOIN content_chunks"))).toBe(false);
  });
});
