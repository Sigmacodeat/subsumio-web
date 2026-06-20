/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { NextRequest as NextRequestImpl } from "next/server";
import { createHandler, createCronHandler } from "./api-handler";
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

vi.mock("./cron-auth", () => ({
  validateCronAuth: vi.fn((req: Request) => {
    const auth = req.headers.get("authorization");
    if (!auth || auth !== "Bearer test-cron-secret") {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return null;
  }),
}));

vi.mock("./env", () => ({
  env: vi.fn((key: string) => {
    if (key === "SUBSUMIO_INTERNAL_SECRET") return "test-internal-secret";
    if (key === "SUBSUMIO_WEB_API_KEY") return "test-api-key";
    return undefined;
  }),
}));

vi.mock("./crypto-utils", () => ({
  timingSafeCompare: vi.fn((a: string, b: string) => a === b),
}));

vi.mock("./prompt-sanitizer", () => ({
  sanitizeObjectStrings: vi.fn((obj: unknown) => obj),
}));

vi.mock("./citation-gate", () => ({
  createCitationGateStream: vi.fn((body: unknown) => body),
  groundJsonResponse: vi.fn(() => ({}),
  ),
  emptyGroundingMetadata: vi.fn(() => ({})),
}));

vi.mock("./auth/api-key-auth", () => ({
  verifyApiKey: vi.fn(() => null),
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
  // Reset default mock implementations
  vi.mocked(requireEngineContext).mockReset();
  vi.mocked(requireEngineContext).mockResolvedValue(mockCtx() as any);
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

// ── createCronHandler Tests ───────────────────────────────────────────

describe("createCronHandler", () => {
  it("1. Valid cron auth → 200", async () => {
    const handler = createCronHandler(async () =>
      Response.json({ ok: true, ran: true }),
    );

    const headers = new Headers();
    headers.set("authorization", "Bearer test-cron-secret");
    const req = new NextRequestImpl("http://localhost:3000/api/cron/test", {
      method: "GET",
      headers,
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ran).toBe(true);
  });

  it("2. Missing cron auth → 401", async () => {
    const handler = createCronHandler(async () =>
      Response.json({ ok: true }),
    );

    const req = new NextRequestImpl("http://localhost:3000/api/cron/test", {
      method: "GET",
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("3. Wrong cron secret → 401", async () => {
    const handler = createCronHandler(async () =>
      Response.json({ ok: true }),
    );

    const headers = new Headers();
    headers.set("authorization", "Bearer wrong-secret");
    const req = new NextRequestImpl("http://localhost:3000/api/cron/test", {
      method: "GET",
      headers,
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(401);
  });

  it("4. Handler throws AppError → structured error", async () => {
    const handler = createCronHandler(async () => {
      throw new AppError("Cron failed", { code: "cron_error", statusCode: 503 });
    });

    const headers = new Headers();
    headers.set("authorization", "Bearer test-cron-secret");
    const req = new NextRequestImpl("http://localhost:3000/api/cron/test", {
      method: "GET",
      headers,
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("cron_error");
  });

  it("5. Handler throws generic Error → 500", async () => {
    const handler = createCronHandler(async () => {
      throw new Error("boom");
    });

    const headers = new Headers();
    headers.set("authorization", "Bearer test-cron-secret");
    const req = new NextRequestImpl("http://localhost:3000/api/cron/test", {
      method: "GET",
      headers,
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal_error");
  });
});

// ── allowInternal Tests ───────────────────────────────────────────────

describe("createHandler allowInternal", () => {
  it("1. Internal secret bypasses auth → 200", async () => {
    // requireEngineContext should NOT be called when internal secret is valid
    vi.mocked(requireEngineContext).mockResolvedValueOnce(
      Response.json({ error: "should_not_reach_here" }, { status: 500 }),
    );

    const handler = createHandler(
      {
        action: "legal.document_review" as any,
        allowInternal: true,
        body: z.object({ text: z.string() }),
      },
      async (ctx, body) => Response.json({ ok: true, brainId: ctx.brainId, text: body.text }),
    );

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("x-internal-secret", "test-internal-secret");
    const req = new NextRequestImpl("http://localhost:3000/api/test", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "hello" }),
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brainId).toBe("internal");
    expect(body.text).toBe("hello");
    // requireEngineContext should not have been called
    expect(requireEngineContext).not.toHaveBeenCalled();
  });

  it("2. Wrong internal secret falls through to normal auth", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(mockCtx() as any);

    const handler = createHandler(
      {
        action: "legal.document_review" as any,
        allowInternal: true,
      },
      async () => Response.json({ ok: true }),
    );

    const req = makeMockRequest("POST", {}, {
      csrfCookie: "tok",
      csrfHeader: "tok",
    });
    // Add wrong internal secret — should fall through to normal auth
    req.headers.set("x-internal-secret", "wrong-secret");
    const res = await handler(req);

    expect(res.status).toBe(200);
    // requireEngineContext SHOULD have been called (fell through to normal auth)
    expect(requireEngineContext).toHaveBeenCalledOnce();
  });

  it("3. No internal secret falls through to normal auth", async () => {
    vi.mocked(requireEngineContext).mockResolvedValueOnce(mockCtx() as any);

    const handler = createHandler(
      {
        action: "legal.document_review" as any,
        allowInternal: true,
      },
      async () => Response.json({ ok: true }),
    );

    const req = makeMockRequest("POST", {}, {
      csrfCookie: "tok",
      csrfHeader: "tok",
    });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(requireEngineContext).toHaveBeenCalledOnce();
  });

  it("4. Internal secret bypasses CSRF", async () => {
    const handler = createHandler(
      {
        action: "legal.document_review" as any,
        allowInternal: true,
        body: z.object({ text: z.string() }),
      },
      async (ctx) => Response.json({ ok: true, brainId: ctx.brainId }),
    );

    // POST with internal secret but NO CSRF cookie/header
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("x-internal-secret", "test-internal-secret");
    const req = new NextRequestImpl("http://localhost:3000/api/test", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "hello" }),
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brainId).toBe("internal");
    // CSRF should not have been checked
    expect(validateCsrf).not.toHaveBeenCalled();
  });

  it("5. Internal context has correct headers from env", async () => {
    const handler = createHandler(
      {
        action: "legal.document_review" as any,
        allowInternal: true,
        body: z.object({ text: z.string() }),
      },
      async (ctx) => Response.json({ ok: true, headers: ctx.headers }),
    );

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("x-internal-secret", "test-internal-secret");
    const req = new NextRequestImpl("http://localhost:3000/api/test", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "hello" }),
    });
    const res = await handler(req as unknown as NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.headers["x-subsumio-api-key"]).toBe("test-api-key");
  });
});
