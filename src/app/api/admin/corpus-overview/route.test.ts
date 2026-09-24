/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// GET /api/admin/corpus-overview — `generatedAt` must be the newest
// snapshot across all sources, not the alphabetically-first source's
// snapshot time. Regression test for the 2026-09-24 dashboard audit:
// readLatestInventory returns rows via `DISTINCT ON (source_id) ORDER BY
// source_id, measured_at DESC`, so inventory[0] was always whichever
// source_id sorts first — a source whose last cron run failed while others
// succeeded made generatedAt look stale (or falsely fresh), independent of
// what actually ran most recently.
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
    user: { id: "u1", email, role: "admin", twoFactorEnabled: true },
  };
}

function get() {
  return GET(
    new NextRequest("http://localhost:3000/api/admin/corpus-overview", {
      headers: { host: "ops.subsum.io" },
    })
  );
}

function inventoryRow(source_id: string, measured_at: string) {
  return {
    source_id,
    kind: "statute",
    pages: 1,
    statutes: 1,
    rechtssaetze: 0,
    texte: 0,
    repealed: 0,
    chunks: 1,
    embedded: 1,
    last_updated: measured_at,
    measured_at,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR);
  vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/corpus-overview", () => {
  it("generatedAt is the newest snapshot, even when it isn't the first row", async () => {
    // "law-at" sorts before "law-at-normen" alphabetically, but its snapshot
    // is older — the old code would have reported the older timestamp.
    pool.query.mockImplementation(async (sql: string) => {
      if (sql.includes("corpus_inventory_snapshot")) {
        return {
          rows: [
            inventoryRow("law-at", "2026-09-24T01:00:00.000Z"),
            inventoryRow("law-at-normen", "2026-09-24T05:00:00.000Z"),
          ],
        };
      }
      return { rows: [] };
    });

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.generatedAt).toBe("2026-09-24T05:00:00.000Z");
  });

  it("generatedAt is null when there is no inventory yet", async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await get();
    const body = await res.json();
    expect(body.data.generatedAt).toBeNull();
  });
});
