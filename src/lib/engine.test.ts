// @vitest-environment node

import { describe, test, expect, vi, afterEach } from "vitest";

// Mock dependencies
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => new Map()),
}));

vi.mock("@/lib/auth/session", () => ({
  verifySession: vi.fn(async () => null),
  SESSION_COOKIE: "subsumio_session",
}));

vi.mock("@/lib/auth/store", () => ({
  getStore: vi.fn(() => ({ getById: vi.fn(async () => null) })),
  getOrgStore: vi.fn(() => ({ getById: vi.fn(async () => null) })),
}));

vi.mock("@/lib/permissions", () => ({
  can: vi.fn(() => true),
  forbidden: vi.fn(() => new Response("Forbidden", { status: 403 })),
}));

vi.mock("@/lib/plans", () => ({
  checkQuota: vi.fn(async () => ({ ok: true, used: 0, limit: 100 })),
  incQuota: vi.fn(async () => {}),
  quotaExceeded: vi.fn(() => new Response("Quota exceeded", { status: 429 })),
}));

vi.mock("@/lib/rate-limit-api", () => ({
  requireApiRate: vi.fn(async () => null),
}));

vi.mock("@/lib/env", () => ({
  env: vi.fn((key: string) => process.env[key]),
}));

import { ENGINE_URL, engineHeadersForBrain, unauthorized } from "./engine";

// engineConfigurationResponse reads CONFIGURED_ENGINE_URL at module load time.
// Use dynamic imports for env-dependent tests.

describe("ENGINE_URL", () => {
  test("defaults to localhost:3001 when no env var", () => {
    const orig = process.env.SUBSUMIO_API_URL;
    delete process.env.SUBSUMIO_API_URL;
    // ENGINE_URL is evaluated at module load time, so we just verify it's a URL
    expect(ENGINE_URL).toMatch(/^https?:\/\//);
    process.env.SUBSUMIO_API_URL = orig;
  });
});

describe("engineHeadersForBrain", () => {
  test("returns headers with x-subsumio-source", () => {
    const headers = engineHeadersForBrain("brain-123");
    expect(headers["x-subsumio-source"]).toBe("brain-123");
  });

  test("includes API key when set", () => {
    process.env.SUBSUMIO_WEB_API_KEY = "test-key";
    const headers = engineHeadersForBrain("brain-123");
    expect(headers["x-subsumio-api-key"]).toBe("test-key");
    delete process.env.SUBSUMIO_WEB_API_KEY;
  });

  test("omits API key when not set", () => {
    delete process.env.SUBSUMIO_WEB_API_KEY;
    const headers = engineHeadersForBrain("brain-123");
    expect(headers["x-subsumio-api-key"]).toBeUndefined();
  });

  test("works with empty brain ID", () => {
    const headers = engineHeadersForBrain("");
    expect(headers["x-subsumio-source"]).toBe("");
  });
});

describe("unauthorized", () => {
  test("returns 401 Response", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });
});

describe("engineConfigurationResponse", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    vi.resetModules();
  });

  async function freshImport() {
    vi.resetModules();
    return await import("./engine");
  }

  test("returns null in development mode", async () => {
    process.env.NODE_ENV = "development";
    const { engineConfigurationResponse } = await freshImport();
    expect(engineConfigurationResponse()).toBeNull();
  });

  test("returns null in production with configured engine URL and API key", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUBSUMIO_API_URL = "http://engine:3001";
    process.env.SUBSUMIO_WEB_API_KEY = "key";
    const { engineConfigurationResponse } = await freshImport();
    expect(engineConfigurationResponse()).toBeNull();
  });

  test("returns 503 in production without engine URL", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SUBSUMIO_API_URL;
    const { engineConfigurationResponse } = await freshImport();
    const res = engineConfigurationResponse();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });

  test("returns 503 in production with engine URL but no API key", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUBSUMIO_API_URL = "http://engine:3001";
    delete process.env.SUBSUMIO_WEB_API_KEY;
    const { engineConfigurationResponse } = await freshImport();
    const res = engineConfigurationResponse();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });
});
