// P0-PROD-007: Tests for /api/health (liveness) and /api/readiness (deep probe).
// Liveness must always return 200 — no external deps.
// Readiness must return 503 when critical deps (engine, auth, config) are down,
// and 200 when all critical deps are ok (optional services can be degraded).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Set required env vars by default
    process.env.AUTH_SECRET = "test-secret";
    process.env.SUBSUMIO_API_URL = "http://localhost:3001";
    process.env.SUBSUMIO_WEB_API_KEY = "test-api-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it("returns 200 when all critical checks pass", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.SENTRY_DSN = "https://test@sentry.io/123";
    process.env.RESEND_API_KEY = "re_test_123";

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ stats: {} }), { status: 200 })) as never;

    const { getStore } = await import("@/lib/auth/store");
    vi.mocked(getStore).mockReturnValue({
      list: vi.fn().mockResolvedValue([{ id: "user1" }]),
    } as never);

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET({} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    // B2: status may be 'degraded' if SMTP or OCR is not configured — that's OK.
    // Critical checks (engine, auth, config) must still be 'ok'.
    expect(body.checks.engine.status).toBe("ok");
    expect(body.checks.auth.status).toBe("ok");
    expect(body.checks.config.status).toBe("ok");
  });

  it("returns 503 when engine is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection refused")) as never;

    const { getStore } = await import("@/lib/auth/store");
    vi.mocked(getStore).mockReturnValue({
      list: vi.fn().mockResolvedValue([{ id: "user1" }]),
    } as never);

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET({} as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("down");
    expect(body.checks.engine.status).toBe("down");
    expect(body.checks.engine.detail).toContain("connection refused");
  });

  it("returns 503 when engine returns non-200", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Internal Server Error", { status: 500 })) as never;

    const { getStore } = await import("@/lib/auth/store");
    vi.mocked(getStore).mockReturnValue({
      list: vi.fn().mockResolvedValue([{ id: "user1" }]),
    } as never);

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET({} as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.engine.status).toBe("down");
  });

  it("returns 503 when auth store throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ stats: {} }), { status: 200 })) as never;

    const { getStore } = await import("@/lib/auth/store");
    vi.mocked(getStore).mockReturnValue({
      list: vi.fn().mockRejectedValue(new Error("DB connection lost")),
    } as never);

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET({} as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.auth.status).toBe("down");
    expect(body.checks.auth.detail).toContain("DB connection lost");
  });

  it("returns 503 when critical env vars are missing", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.SUBSUMIO_API_URL;
    delete process.env.SUBSUMIO_WEB_API_KEY;

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
    expect(body.checks.config.detail).toContain("AUTH_SECRET");
    expect(body.checks.config.detail).toContain("SUBSUMIO_API_URL");
    expect(body.checks.config.detail).toContain("SUBSUMIO_WEB_API_KEY");
  });

  it("reports optional services as degraded, not down", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    delete process.env.RESEND_API_KEY;

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ stats: {} }), { status: 200 })) as never;

    const { getStore } = await import("@/lib/auth/store");
    vi.mocked(getStore).mockReturnValue({
      list: vi.fn().mockResolvedValue([{ id: "user1" }]),
    } as never);

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET({} as never);
    // Critical deps are ok → 200 even though optional are degraded
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.stripe.status).toBe("degraded");
    expect(body.checks.sentry.status).toBe("degraded");
    expect(body.checks.email.status).toBe("degraded");
  });

  it("includes latencyMs for engine and auth checks", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return new Response(JSON.stringify({ stats: {} }), { status: 200 });
    }) as never;

    const { getStore } = await import("@/lib/auth/store");
    vi.mocked(getStore).mockReturnValue({
      list: vi.fn().mockResolvedValue([{ id: "user1" }]),
    } as never);

    const { GET } = await import("@/app/api/readiness/route");
    const res = await GET({} as never);
    const body = await res.json();
    expect(body.checks.engine.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.checks.auth.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("sends API key header to engine when configured", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ stats: {} }), { status: 200 }));
    globalThis.fetch = fetchSpy as never;

    const { getStore } = await import("@/lib/auth/store");
    vi.mocked(getStore).mockReturnValue({
      list: vi.fn().mockResolvedValue([{ id: "user1" }]),
    } as never);

    const { GET } = await import("@/app/api/readiness/route");
    await GET({} as never);

    // B2: fetch may be called multiple times (engine + SMTP settings check).
    // The first call is always the engine readiness probe.
    expect(fetchSpy).toHaveBeenCalled();
    const [, options] = fetchSpy.mock.calls[0];
    expect(options.headers["x-subsumio-api-key"]).toBe("test-api-key");
  });
});
