/**
 * OAuth CSRF regression test for the DocuSign callback route.
 *
 * The callback must reject requests that do not carry the state cookie we
 * minted in /api/docusign/auth. Without this guard, an attacker could trick
 * a logged-in user into linking the attacker's DocuSign account to the
 * victim's Subsumio account.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const DOCUSIGN_OAUTH_STATE_COOKIE = "docusign_oauth_state";

function makeRequest(url: string, cookieState?: string): NextRequest {
  const headers = new Headers();
  if (cookieState) {
    headers.set("cookie", `${DOCUSIGN_OAUTH_STATE_COOKIE}=${cookieState}`);
  }
  return new NextRequest(url, { headers });
}

import { cookies } from "next/headers";

// Mock next/headers cookies() — return a minimal cookie store so engineContext runs.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

// Mock session verification — return a fixed user so createHandler passes auth.
vi.mock("@/lib/auth/session", () => ({
  verifySession: async () => ({
    uid: "user-1",
    email: "user@example.com",
    role: "admin",
  }),
  SESSION_COOKIE: "sb_session",
  SESSION_TTL_SECONDS: 604800,
  revokeAllSessions: async () => {},
  signSession: async () => "",
  createSession: async () => ({ token: "", cookieOptions: {} }),
}));

// Mock the user store so the handler doesn't hit the database.
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async () => ({
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      role: "admin",
      brainId: "brain-1",
      plan: "enterprise",
      locale: "de",
      referralCode: "",
      referredBy: null,
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
    }),
    update: async () => {},
  }),
}));

vi.mock("@/lib/env", () => ({
  env: (key: string) => {
    if (key === "DOCUSIGN_INTEGRATION_KEY") return "test-ik";
    if (key === "DOCUSIGN_SECRET_KEY") return "test-secret";
    if (key === "NEXT_PUBLIC_APP_URL") return "https://app.example.com";
    return undefined;
  },
}));

vi.mock("@/lib/crypto-utils", () => ({
  timingSafeCompare: (a: string, b: string) => a === b,
}));

// Mock the external DocuSign token exchange to avoid real network calls.
vi.mock("@/lib/retry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/retry")>("@/lib/retry");
  return {
    ...actual,
    externalFetchTimeout: () => AbortSignal.timeout(5000),
  };
});

global.fetch = vi.fn(async () =>
  Response.json({
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
  })
) as unknown as typeof fetch;

describe("GET /api/docusign/callback", () => {
  it("rejects callback when the state cookie is missing", async () => {
    const req = makeRequest("https://app.example.com/api/docusign/callback?code=abc123&state=xyz");
    const res = await GET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("state_mismatch");
  });

  it("rejects callback when the state query param mismatches the cookie", async () => {
    const req = makeRequest(
      "https://app.example.com/api/docusign/callback?code=abc123&state=attacker",
      "legitimate-state"
    );
    const res = await GET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("state_mismatch");
  });

  it("exchanges the code when state matches", async () => {
    const state = "legitimate-state";
    const req = makeRequest(
      `https://app.example.com/api/docusign/callback?code=abc123&state=${encodeURIComponent(state)}`,
      state
    );
    const res = await GET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; connected: boolean };
    expect(body.ok).toBe(true);
    expect(body.connected).toBe(true);
  });
});
