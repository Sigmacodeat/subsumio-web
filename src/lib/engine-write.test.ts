// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const fetchMock = vi.fn();

import { EngineWriteError, engineWriteOrThrow, enginePageExists, requireEngineOk } from "./engine";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

const HEADERS = { "x-subsumio-source": "test-brain" };

describe("engineWriteOrThrow", () => {
  it("returns the response on 2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const res = await engineWriteOrThrow(HEADERS, { slug: "a/b" });
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/pages");
    expect(init.method).toBe("POST");
  });

  it("throws EngineWriteError (502) on a non-2xx response instead of treating it as success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "disk full" }), { status: 500 })
    );
    const err = await engineWriteOrThrow(HEADERS, { slug: "a/b" }).catch((e) => e);
    expect(err).toBeInstanceOf(EngineWriteError);
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe("engine_write_failed");
    // Internal engine details must not leak into the public message.
    expect(err.message).not.toContain("disk full");
    expect(err.details?.engineMessage).toBe("disk full");
  });

  it("propagates network failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(engineWriteOrThrow(HEADERS, {})).rejects.toThrow("ECONNREFUSED");
  });
});

describe("enginePageExists", () => {
  it("returns false on 404, true on 200", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    await expect(enginePageExists(HEADERS, "legal/x")).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(enginePageExists(HEADERS, "legal/x")).resolves.toBe(true);
  });

  it("fails closed on non-404 errors (a 500 is not 'not found')", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await expect(enginePageExists(HEADERS, "legal/x")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("url-encodes each slug segment", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await enginePageExists(HEADERS, "legal/cases/Müller & Co");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("M%C3%BCller%20%26%20Co");
  });
});

describe("requireEngineOk", () => {
  it("returns the response when ok, throws EngineWriteError otherwise", async () => {
    const ok = new Response("{}", { status: 200 });
    await expect(requireEngineOk(ok)).resolves.toBe(ok);

    const bad = new Response(JSON.stringify({ error: "nope" }), { status: 409 });
    await expect(requireEngineOk(bad)).rejects.toBeInstanceOf(EngineWriteError);
  });
});
