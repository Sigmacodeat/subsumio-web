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
}));

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const mockListEnginePages = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...a: unknown[]) => mockListEnginePages(...a),
  ENGINE_LIST_MAX: 100,
}));

import { GET } from "./route";

describe("GET /api/agent-templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListEnginePages.mockResolvedValue([]);
  });

  it("returns the templates list on success", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      { slug: "agents/templates/a", title: "Vorlage A", frontmatter: {} },
    ]);
    const res = await GET(new NextRequest("http://localhost/api/agent-templates"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0].slug).toBe("agents/templates/a");
  });

  it("returns 503 — not 200 with an empty list — when the engine read fails", async () => {
    mockListEnginePages.mockRejectedValueOnce(new Error("engine down"));
    const res = await GET(new NextRequest("http://localhost/api/agent-templates"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("service_unavailable");
  });
});
