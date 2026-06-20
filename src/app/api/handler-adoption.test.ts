/**
 * Regression test: verify that migrated API routes use createHandler / createPublicHandler
 * and that the handler factories produce callable functions.
 *
 * This catches accidental reverts to ad-hoc `export async function POST/GET` patterns
 * and ensures the central guard pipeline (auth, RBAC, CSRF, rate limit, audit) is applied.
 *
 * We mock next/headers cookies() and session verification to simulate
 * "no session" so createHandler returns 401 without needing a real request scope.
 */

import { describe, it, expect, vi } from "vitest";

// Mock next/headers cookies() — returns empty jar (no session)
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

// Mock session verification — always returns null (no session)
vi.mock("@/lib/auth/session", () => ({
  verifySession: async () => null,
  SESSION_COOKIE: "sb_session",
  SESSION_TTL_SECONDS: 604800,
  revokeAllSessions: async () => {},
  signSession: async () => "",
  createSession: async () => ({ token: "", cookieOptions: {} }),
}));

describe("API handler adoption — createHandler / createPublicHandler", () => {
  it("auth/me route exports createHandler-wrapped GET and PATCH", async () => {
    const mod = await import("./auth/me/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.PATCH).toBe("function");
    // Without a session, createHandler should return 401
    const res = await mod.GET(new Request("http://localhost/api/auth/me") as never);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("auth/2fa/setup route exports createHandler-wrapped POST", async () => {
    const mod = await import("./auth/2fa/setup/route");
    expect(typeof mod.POST).toBe("function");
    const res = await mod.POST(new Request("http://localhost/api/auth/2fa/setup", {
      method: "POST",
    }) as never);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("auth/2fa/verify route exports createHandler-wrapped POST", async () => {
    const mod = await import("./auth/2fa/verify/route");
    expect(typeof mod.POST).toBe("function");
    const res = await mod.POST(new Request("http://localhost/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ token: "123456" }),
      headers: { "Content-Type": "application/json" },
    }) as never);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("auth/2fa/disable route exports createHandler-wrapped POST", async () => {
    const mod = await import("./auth/2fa/disable/route");
    expect(typeof mod.POST).toBe("function");
    const res = await mod.POST(new Request("http://localhost/api/auth/2fa/disable", {
      method: "POST",
    }) as never);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("docusign/auth route exports createHandler-wrapped GET", async () => {
    const mod = await import("./docusign/auth/route");
    expect(typeof mod.GET).toBe("function");
    const res = await mod.GET(new Request("http://localhost/api/docusign/auth") as never);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("demo route exports createPublicHandler-wrapped GET (no auth required)", async () => {
    const mod = await import("./demo/route");
    expect(typeof mod.GET).toBe("function");
    // Public handler doesn't require auth — should return a Response (not 401)
    const res = await mod.GET(new Request("http://localhost/api/demo?q=test") as never);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).not.toBe(401);
  });
});
