// P0-PROD-007: Tests for /api/health (liveness) and /api/readiness (deep probe).
// Liveness must always return 200 — no external deps.
// Readiness must return 503 when critical deps (engine, auth, config) are down,
// and 200 when all critical deps are ok (optional services can be degraded).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/store", () => ({
  getStore: vi.fn(),
}));

// ── Liveness: /api/health ─────────────────────────────────────────────

describe("GET /api/health (liveness)", () => {
  it("always returns 200 with status ok", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET({} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeTruthy();
  });

  it("does not check external dependencies", async () => {
    const { GET } = await import("@/app/api/health/route");
    // Even if fetch throws, liveness should still return 200
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    try {
      const res = await GET({} as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Readiness: /api/readiness ─────────────────────────────────────────

describe("GET /api/readiness (deep probe)", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let ipCounter = 0;

  /** Distinct client IP per request unless given — the probe is rate-limited per IP. */
  function req(opts: { ip?: string; headers?: Record<string, string> } = {}) {
    return new NextRequest("http://localhost:3000/api/readiness", {
      headers: {
        "x-real-ip": opts.ip ?? `10.9.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`,
        ...opts.headers,
      },
    });
  }

  async function mockStore(getById: ReturnType<typeof vi.fn>) {
    const { getStore } = await import("@/lib/auth/store");
    const list = vi.fn().mockResolvedValue([{ id: "user1", brainId: "brain-1" }]);
    vi.mocked(getStore).mockReturnValue({ getById, list } as never);
    return { list };
  }

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Set required env vars by default
    process.env.AUTH_SECRET = "test-secret";
    process.env.SUBSUMIO_API_URL = "http://localhost:3001";
    process.env.SUBSUMIO_WEB_API_KEY = "test-api-key";
    process.env.CRON_SECRET = "cron-secret";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it("returns 200 when all critical checks pass", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.SENTRY_DSN = "https://test@sentry.io/123";
    process.env.RESEND_API_KEY = "re_test_123";
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 })) as never;
    await mockStore(vi.fn().mockResolvedValue(null));

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.engine.status).toBe("ok");
    expect(body.checks.auth.status).toBe("ok");
    expect(body.checks.config.status).toBe("ok");
  });

  it("never scans the user table and probes the engine without a tenant", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchSpy as never;
    const getById = vi.fn().mockResolvedValue(null);
    const { list } = await mockStore(getById);

    const { GET } = await import("@/app/api/readiness/route");
    await GET(req());
    expect(list).not.toHaveBeenCalled();
    expect(getById).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/health$/);
    expect(options?.headers?.["x-subsumio-source"]).toBeUndefined();
  });

  it("returns 503 when engine is unreachable — anonymous answer carries no error text", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED db-host:5432")) as never;
    await mockStore(vi.fn().mockResolvedValue(null));

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("down");
    expect(body.checks.engine.status).toBe("down");
    expect(body.checks.engine.detail).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });

  it("gives operators (CRON_SECRET) the diagnostic details", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection refused")) as never;
    await mockStore(vi.fn().mockRejectedValue(new Error("DB connection lost")));

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET(req({ headers: { authorization: "Bearer cron-secret" } }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.engine.detail).toContain("connection refused");
    expect(body.checks.auth.detail).toContain("DB connection lost");
  });

  it("returns 503 when engine returns non-200", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Internal Server Error", { status: 500 })) as never;
    await mockStore(vi.fn().mockResolvedValue(null));

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).checks.engine.status).toBe("down");
  });

  it("returns 503 when auth store throws", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 })) as never;
    await mockStore(vi.fn().mockRejectedValue(new Error("DB connection lost")));

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.auth.status).toBe("down");
    expect(body.checks.auth.detail).toBeUndefined();
  });

  it("returns 503 when critical env vars are missing — names only for operators", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.SUBSUMIO_API_URL;
    delete process.env.SUBSUMIO_WEB_API_KEY;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 })) as never;
    await mockStore(vi.fn().mockResolvedValue(null));

    const { GET } = await import("@/app/api/readiness/route");
    const anon = await (await GET(req())).json();
    expect(anon.checks.config.status).toBe("down");
    expect(JSON.stringify(anon)).not.toContain("AUTH_SECRET");

    const op = await (await GET(req({ headers: { authorization: "Bearer cron-secret" } }))).json();
    expect(op.checks.config.detail).toContain("AUTH_SECRET");
    expect(op.checks.config.detail).toContain("SUBSUMIO_API_URL");
    expect(op.checks.config.detail).toContain("SUBSUMIO_WEB_API_KEY");
  });

  it("production without CRON_SECRET is not ready (QA-9)", async () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.SUBSUMIO_ENCRYPTION_KEY = "k";
    process.env.SUBSUMIO_INTERNAL_SECRET = "s";
    process.env.PORTAL_TOKEN_SECRET = "p";
    process.env.DATABASE_URL = "postgres://x";
    delete process.env.CRON_SECRET;

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ stats: {} }), { status: 200 })) as never;
    const { getStore } = await import("@/lib/auth/store");
    vi.mocked(getStore).mockReturnValue({
      list: vi.fn().mockResolvedValue([{ id: "user1" }]),
    } as never);

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET({} as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.config.status).toBe("down");
    expect(body.checks.config.detail).toContain("CRON_SECRET");
  });

  it("reports optional services as degraded, not down", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    delete process.env.RESEND_API_KEY;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 })) as never;
    await mockStore(vi.fn().mockResolvedValue(null));

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.stripe.status).toBe("degraded");
    expect(body.checks.sentry.status).toBe("degraded");
    expect(body.checks.email.status).toBe("degraded");
  });

  it("does not claim OCR/SMTP are ok without checking them", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 })) as never;
    await mockStore(vi.fn().mockResolvedValue(null));

    const { GET } = await import("@/app/api/readiness/route");
    const body = await (await GET(req())).json();
    expect(body.checks.ocr.status).toBe("unchecked");
    expect(body.checks.smtp.status).toBe("unchecked");
  });

  it("includes latencyMs for engine and auth checks (operator view)", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return new Response("ok", { status: 200 });
    }) as never;
    await mockStore(vi.fn().mockResolvedValue(null));

    const { GET } = await import("@/app/api/readiness/route");
    const body = await (
      await GET(req({ headers: { authorization: "Bearer cron-secret" } }))
    ).json();
    expect(body.checks.engine.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.checks.auth.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("rate-limits per IP: the 21st call within a minute gets 429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 })) as never;
    await mockStore(vi.fn().mockResolvedValue(null));

    const { GET } = await import("@/app/api/readiness/route");
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await GET(req({ ip: "203.0.113.7" }))).status);
    expect(statuses.slice(0, 20).every((s) => s !== 429)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
