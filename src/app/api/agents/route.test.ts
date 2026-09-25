// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: Record<string, unknown>,
    handler: (ctx: unknown, body: unknown, query: unknown, req: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
        headers: { "x-subsumio-source": "test-brain" },
      };
      const query = Object.fromEntries(new URL(req.url).searchParams.entries());
      const body = req.method === "GET" ? undefined : await req.json().catch(() => ({}));
      return handler(ctx, body, query, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  recordCreditConsumption: vi.fn(),
}));

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const fetchMock = vi.fn();

import { GET } from "./route";

describe("GET /api/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the jobs list on success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ jobs: [{ id: 1, name: "job-a" }] }), { status: 200 })
    );
    const res = await GET(new NextRequest("http://localhost/api/agents"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
  });

  it("returns 503 — not 200 with an empty jobs list — when the engine fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("engine down", { status: 500 }));
    const res = await GET(new NextRequest("http://localhost/api/agents"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("service_unavailable");
  });
});
