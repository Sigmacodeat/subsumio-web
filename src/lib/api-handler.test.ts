/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { NextRequest as NextRequestImpl } from "next/server";
import { createHandler } from "./api-handler";
import { AppError } from "./errors";
import { z } from "zod";

// ── Mocks ──────────────────────────────────────────────────────────────
// We mock the engine module to control auth/RBAC/rate-limit/quota behavior.

vi.mock("./engine", () => ({
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));

vi.mock("./audit", () => ({
  logAudit: vi.fn(),
}));

vi.mock("./csrf", async () => {
  return {
    CSRF_COOKIE_NAME: "sb_csrf",
    validateCsrf: vi.fn((req: Request, _cookieValue: string | undefined) => {
      const method = req.method.toUpperCase();
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
      // Read CSRF cookie directly from cookie header (jsdom doesn't parse NextRequest.cookies)
      const cookieHeader = req.headers.get("cookie") ?? "";
      const csrfMatch = cookieHeader.match(/sb_csrf=([^;]+)/);
      const cookieVal = csrfMatch ? csrfMatch[1] : undefined;
      const headerToken = req.headers.get("x-csrf-token");
      if (!headerToken || !cookieVal) return false;
      return headerToken === cookieVal;
    }),
  };
});

// Import after mocks are set up
import { requireEngineContext } from "./engine";
import { logAudit } from "./audit";
import { validateCsrf } from "./csrf";

// ── Helpers ────────────────────────────────────────────────────────────

function makeMockRequest(
  method: string = "POST",
  body?: unknown,
  opts?: { csrfCookie?: string; csrfHeader?: string },
): NextRequest {
  const headers = new Headers();
  if (opts?.csrfHeader) headers.set("x-csrf-token", opts.csrfHeader);

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers.set("Content-Type", "application/json");
  }

  const url = "http://localhost:3000/api/test";
  const req = new NextRequestImpl(url, init as ConstructorParameters<typeof NextRequestImpl>[1]);

  // Manually set cookies if provided
  if (opts?.csrfCookie) {
    req.headers.set("cookie", `sb_csrf=${opts.csrfCookie}`);
  }

  return req as unknown as NextRequest;
}

function mockCtx(overrides?: Partial<{ role: string; id: string; email: string }>) {
  return {
    headers: {},
    brainId: "brain_test",
    plan: "free" as const,
    user: {
      id: overrides?.id ?? "user_1",
      email: overrides?.email ?? "test@test.com",
      name: "Test User",
      passwordHash: "",
      role: (overrides?.role ?? "admin") as any,
      plan: "free" as any,
      locale: "de" as const,
      referralCode: "",
      referredBy: null,
      brainId: "brain_test",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("createHandler Guard-Chain", () => {
  it("1. Unauthenticated request → 401", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );

    const handler = createHandler(
      { action: "brain.write" },
      async () => Response.json({ ok: true }),
    );

    const req = makeMockRequest("POST", { foo: "bar" });
    const res = await handler(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("2. Authenticated but forbidden → 403", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(
      Response.json({ error: "forbidden", message: "Action 'brain.write' not permitted" }, { status: 403 }),
    );

    const handler = createHandler(
      { action: "brain.write" },
      async () => Response.json({ ok: true }),
    );

    const req = makeMockRequest("POST", { foo: "bar" });
    const res = await handler(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("3. CSRF token missing → 403", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const handler = createHandler(
      { action: "brain.write" },
      async () => Response.json({ ok: true }),
    );

    // POST without CSRF cookie or header
    const req = makeMockRequest("POST", { foo: "bar" });
    const res = await handler(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("csrf_invalid");
  });

  it("4. CSRF token mismatch → 403", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const handler = createHandler(
      { action: "brain.write" },
      async () => Response.json({ ok: true }),
    );

    // POST with CSRF cookie but wrong header
    const req = makeMockRequest("POST", { foo: "bar" }, {
      csrfCookie: "token_a",
      csrfHeader: "token_b",
    });
    const res = await handler(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("csrf_invalid");
  });

  it("5. Zod validation failed → 400", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const schema = z.object({ plan: z.enum(["pro", "team"]) });
    const handler = createHandler(
      { action: "billing.write", body: schema },
      async () => Response.json({ ok: true }),
    );

    // Valid CSRF but invalid body
    const req = makeMockRequest("POST", { plan: "enterprise" }, {
      csrfCookie: "tok",
      csrfHeader: "tok",
    });
    const res = await handler(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("validation_failed");
  });

  it("6. Valid request → 200 + audit log", async () => {
    const ctx = mockCtx() as any;
    vi.mocked(requireEngineContext).mockResolvedValueOnce(ctx);

    const handler = createHandler(
      {
        action: "billing.write",
        body: z.object({ plan: z.enum(["pro", "team"]) }),
        audit: () => ({
          action: "billing.upgrade" as any,
          entityType: "billing",
          details: { plan: "pro" },
        }),
      },
      async (_ctx, body) => Response.json({ ok: true, plan: body.plan }),
    );

    const req = makeMockRequest("POST", { plan: "pro" }, {
      csrfCookie: "tok",
      csrfHeader: "tok",
    });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Audit should have been called
    expect(logAudit).toHaveBeenCalledOnce();
  });

  it("7. Handler throws AppError → structured error response", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const handler = createHandler(
      { action: "brain.write" },
      async () => {
        throw new AppError("Something went wrong", {
          code: "custom_error",
          statusCode: 422,
        });
      },
    );

    const req = makeMockRequest("POST", { foo: "bar" }, {
      csrfCookie: "tok",
      csrfHeader: "tok",
    });
    const res = await handler(req);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("custom_error");
    expect(body.error).toBe("Something went wrong");
  });

  it("8. Handler throws generic Error → 500 internal_error", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const handler = createHandler(
      { action: "brain.write" },
      async () => {
        throw new Error("boom");
      },
    );

    const req = makeMockRequest("POST", { foo: "bar" }, {
      csrfCookie: "tok",
      csrfHeader: "tok",
    });
    const res = await handler(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal_error");
  });

  it("9. Invalid JSON body → 400", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const handler = createHandler(
      { action: "brain.write", body: z.object({ foo: z.string() }) },
      async () => Response.json({ ok: true }),
    );

    // Create request with invalid JSON body
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("cookie", "sb_csrf=tok");
    headers.set("x-csrf-token", "tok");
    const req = new NextRequestImpl("http://localhost:3000/api/test", {
      method: "POST",
      headers,
      body: "not valid json{",
    });

    const res = await handler(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_json");
  });

  it("10. GET request with query validation → 200 with parsed query", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const querySchema = z.object({ page: z.string().optional() });
    const handler = createHandler(
      { action: "brain.read", query: querySchema },
      async (_ctx, _body, query) => Response.json({ page: query?.page ?? "1" }),
    );

    const req = new NextRequestImpl("http://localhost:3000/api/test?page=5", {
      method: "GET",
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe("5");
  });

  it("11. Audit log is not called on failed handler (non-2xx)", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const handler = createHandler(
      {
        action: "brain.write",
        audit: () => ({
          action: "brain.write" as any,
          entityType: "test",
        }),
      },
      async () => Response.json({ error: "something" }, { status: 400 }),
    );

    const req = makeMockRequest("POST", {}, {
      csrfCookie: "tok",
      csrfHeader: "tok",
    });
    const res = await handler(req);

    expect(res.status).toBe(400);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
