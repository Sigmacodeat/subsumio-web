/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// GET /api/admin/corpus-alerts — the ops badge count must not be capped by
// the list `limit` param. Regression test for the 2026-09-24 dashboard
// audit: the badge called this route with limit=1 and read unreadCount off
// the (therefore always 0-or-1) returned array, so it could never show more
// than one unread alert no matter how many actually existed.
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

function get(qs: string) {
  return GET(
    new NextRequest(`http://localhost:3000/api/admin/corpus-alerts?${qs}`, {
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

describe("GET /api/admin/corpus-alerts", () => {
  it("unreadCount reflects the true total, not the limit-capped list length", async () => {
    // The list query (LIMIT 1) returns one row; the real unread total is 12.
    pool.query.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) return { rows: [{ n: 12 }] };
      return { rows: [{ id: "n1", read_at: null, created_at: new Date().toISOString() }] };
    });

    const res = await get("unread=true&limit=1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.count).toBe(1); // the capped list is still length 1
    expect(body.data.unreadCount).toBe(12); // but the real count is not capped
  });

  it("unreadCount is 0 when there are no unread alerts, independent of the list", async () => {
    pool.query.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) return { rows: [{ n: 0 }] };
      return { rows: [] };
    });

    const res = await get("unread=true&limit=1");
    const body = await res.json();
    expect(body.data.unreadCount).toBe(0);
  });
});
