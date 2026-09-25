// @vitest-environment node
//
// Audit QA-5: session revocation must not fail open when its store is
// unreachable — neither at the edge cache nor in the Node verifier.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const pool = { query: vi.fn() };
vi.mock("./store", () => ({ getSharedPgPool: vi.fn(() => pool) }));
vi.mock("@/lib/schema-init", () => ({ createSchemaInit: vi.fn(() => vi.fn(async () => {})) }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  setRequestIdProvider: vi.fn(),
}));

const origEnv = { ...process.env };

beforeEach(() => {
  pool.query.mockReset();
  process.env = { ...origEnv, AUTH_SECRET: "test-secret-that-is-long-enough-123456" };
});
afterEach(() => {
  process.env = { ...origEnv };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("revocation store (Node)", () => {
  test("a query error without a known value throws instead of returning 0", async () => {
    const { getMinRevocationVersion } = await import("./revocation-store");
    pool.query.mockRejectedValueOnce(new Error("db down"));
    await expect(getMinRevocationVersion("user-unknown-1")).rejects.toThrow("db down");
  });

  test("a query error falls back to the last value read by this process", async () => {
    const { getMinRevocationVersion } = await import("./revocation-store");
    pool.query.mockResolvedValueOnce({ rows: [{ min_version: 5 }] });
    expect(await getMinRevocationVersion("user-known-1")).toBe(5);
    pool.query.mockRejectedValueOnce(new Error("db down"));
    expect(await getMinRevocationVersion("user-known-1")).toBe(5);
  });

  test("isSidRevoked throws on a query error instead of reporting 'not revoked'", async () => {
    const { isSidRevoked } = await import("./session-registry");
    pool.query.mockRejectedValue(new Error("db down"));
    await expect(isSidRevoked("user-1", "sid-never-seen")).rejects.toThrow();
  });

  test("verifySession rejects the session when the sid check cannot be made", async () => {
    const { signSession } = await import("./session-core");
    const { verifySession } = await import("./session");
    const token = await signSession(
      { uid: "user-sid-1", email: "a@example.com", role: "lawyer", sid: "sid-1" },
      undefined,
      undefined,
      6
    );
    // min_version read works (4 < 6), the registry query fails.
    pool.query.mockImplementation(async (sql: string) => {
      if (sql.includes("subsumio_session_revocations")) return { rows: [{ min_version: 4 }] };
      throw new Error("db down");
    });
    expect(await verifySession(token)).toBeNull();
  });
});

describe("revocation-check endpoint", () => {
  test("store error → 503, never an empty 'nothing revoked' answer", async () => {
    vi.doMock("@/lib/auth/rate-limit", () => ({
      clientIp: () => "127.0.0.1",
      hit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
    }));
    pool.query.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/internal/revocation-check/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/internal/revocation-check?uid=user-endpoint-1")
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("minVersion");
  });
});

describe("edge revocation cache (verifySessionCore)", () => {
  test("a cached minVersion stays in force when the endpoint answers 503", async () => {
    process.env.SUBSUMIO_INTERNAL_URL = "http://internal.test";
    const fetchMock = vi.fn(async () => Response.json({ minVersion: 5, revokedSids: [] }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T10:00:00Z"));

    const { signSession, verifySessionCore } = await import("./session-core");
    const token = await signSession(
      { uid: "user-edge-1", email: "a@example.com", role: "lawyer" },
      undefined,
      undefined,
      3
    );
    await verifySessionCore(token); // first lookup: populates the cache in the background
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(await verifySessionCore(token)).toBeNull(); // v=3 <= 5

    // Cache expired, store unreachable → 503. The old entry must survive.
    vi.setSystemTime(new Date("2026-09-25T10:02:00Z"));
    fetchMock.mockImplementation(async () =>
      Response.json({ error: "down", code: "service_unavailable" }, { status: 503 })
    );
    expect(await verifySessionCore(token)).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(await verifySessionCore(token)).toBeNull();
  });
});
