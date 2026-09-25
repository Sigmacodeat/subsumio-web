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
  apiSuccess: (data: unknown, meta?: unknown, status = 200) =>
    Response.json({ data, ...(meta ? { meta } : {}) }, { status }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const fetchMock = vi.fn();

import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/legal/playbooks");
}

describe("GET /api/legal/playbooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the playbook list inside the success envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ slug: "legal/playbooks/a", frontmatter: {} }]), {
        status: 200,
      })
    );
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it("returns 503 — not 200 with an empty list — when the engine fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("engine down", { status: 500 }));
    const res = await GET(getReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("service_unavailable");
  });
});
