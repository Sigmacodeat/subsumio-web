/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// POST /api/admin/corpus-pipeline fetch_missing — the single fetch trigger
// must not be overwritten while another source's fetch is pending (a click
// on "Nachholen" once silently dropped a running multi-day court fetch).
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

const OPERATOR = "ops@subsumio.example";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/admin/corpus-pipeline", {
      method: "POST",
      headers: {
        host: "ops.subsum.io",
        origin: "https://ops.subsum.io",
        "content-type": "application/json",
        "x-csrf-token": "t",
        cookie: "sb_csrf=t",
      },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR);
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "brain",
    plan: "team",
    user: { id: "u1", email: OPERATOR, role: "admin", twoFactorEnabled: true },
  } as any);
});

describe("fetch_missing", () => {
  it("refuses to overwrite a pending fetch of another source", async () => {
    pool.query.mockImplementation(async (sql: string) =>
      sql.includes("SELECT value")
        ? { rows: [{ value: { source_key: "jud-bvwg" }, updated_at: new Date() }] }
        : { rows: [] }
    );
    const res = await post({ action: "fetch_missing", source_key: "landesrecht" });
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain("jud-bvwg");
    expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(false);
  });

  it("sets the trigger when nothing is pending", async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await post({ action: "fetch_missing", source_key: "landesrecht" });
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(true);
  });
});
