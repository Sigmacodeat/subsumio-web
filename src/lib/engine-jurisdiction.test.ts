// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the module under test.
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

// ─── WP3: engineHeadersWithCaseJurisdiction ─────────────────────────────

describe("WP3: engineHeadersWithCaseJurisdiction", () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear the in-memory cache between tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function importEngine() {
    const mod = await import("./engine");
    return mod;
  }

  function mockFetchResponse(body: unknown, ok = true, status = 200) {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status: ok ? status : status,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;
  }

  test("injects x-subsumio-case-jurisdiction when case has jurisdiction", async () => {
    mockFetchResponse({
      frontmatter: { jurisdiction: "DE" },
    });
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      "legal/cases/mueller-vs-schmidt"
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBe("de");
    expect(result["x-subsumio-source"]).toBe("brain_abc");
  });

  test("does not inject header when case has no jurisdiction", async () => {
    mockFetchResponse({
      frontmatter: { title: "Some case" },
    });
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      "legal/cases/no-jurisdiction"
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBeUndefined();
  });

  test("does not inject header when case slug is empty", async () => {
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      ""
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBeUndefined();
    expect(result["x-subsumio-source"]).toBe("brain_abc");
  });

  test("does not inject header when case slug is undefined", async () => {
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      undefined
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBeUndefined();
  });

  test("does not inject header when case slug is whitespace-only", async () => {
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      "   "
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBeUndefined();
  });

  test("does not inject header when engine fetch fails (404)", async () => {
    mockFetchResponse({ error: "not_found" }, false, 404);
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      "legal/cases/nonexistent"
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBeUndefined();
  });

  test("does not inject header when engine fetch throws (network error)", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      "legal/cases/network-error"
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBeUndefined();
  });

  test("preserves existing headers (does not clobber)", async () => {
    mockFetchResponse({
      frontmatter: { jurisdiction: "AT" },
    });
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      {
        "x-subsumio-source": "brain_abc",
        "x-subsumio-api-key": "secret-key",
        "x-subsumio-jurisdiction": "DE",
      },
      "legal/cases/austrian-case"
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBe("at");
    expect(result["x-subsumio-jurisdiction"]).toBe("DE");
    expect(result["x-subsumio-api-key"]).toBe("secret-key");
    expect(result["x-subsumio-source"]).toBe("brain_abc");
  });

  test("case jurisdiction takes priority over user jurisdiction", async () => {
    mockFetchResponse({
      frontmatter: { jurisdiction: "AT" },
    });
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    // User is DE but case is AT — case wins
    const result = await engineHeadersWithCaseJurisdiction(
      {
        "x-subsumio-source": "brain_abc",
        "x-subsumio-jurisdiction": "DE",
      },
      "legal/cases/austrian-matter"
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBe("at");
    expect(result["x-subsumio-jurisdiction"]).toBe("DE");
  });

  test("normalizes uppercase jurisdiction from frontmatter to lowercase", async () => {
    mockFetchResponse({
      frontmatter: { jurisdiction: "CH" },
    });
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      "legal/cases/swiss-case"
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBe("ch");
  });

  test("rejects invalid jurisdiction values from frontmatter", async () => {
    mockFetchResponse({
      frontmatter: { jurisdiction: "XX" },
    });
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const result = await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      "legal/cases/invalid-jur"
    );
    expect(result["x-subsumio-case-jurisdiction"]).toBeUndefined();
  });

  test("uses cache on second call for same case (single fetch)", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({ frontmatter: { jurisdiction: "DE" } }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchFn as unknown as typeof fetch;
    const { engineHeadersWithCaseJurisdiction } = await importEngine();
    const headers = { "x-subsumio-source": "brain_abc" };

    await engineHeadersWithCaseJurisdiction(headers, "legal/cases/cached");
    await engineHeadersWithCaseJurisdiction(headers, "legal/cases/cached");

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("cache is scoped per brainId (different source = different cache key)", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({ frontmatter: { jurisdiction: "DE" } }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchFn as unknown as typeof fetch;
    const { engineHeadersWithCaseJurisdiction } = await importEngine();

    await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_a" },
      "legal/cases/same-slug"
    );
    await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_b" },
      "legal/cases/same-slug"
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("trims case slug before lookup", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({ frontmatter: { jurisdiction: "DE" } }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchFn as unknown as typeof fetch;
    const { engineHeadersWithCaseJurisdiction } = await importEngine();

    await engineHeadersWithCaseJurisdiction(
      { "x-subsumio-source": "brain_abc" },
      "  legal/cases/trimmed  "
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = (fetchFn.mock.calls[0][0] as string);
    expect(url).toContain("legal/cases/trimmed");
  });
});
