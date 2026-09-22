import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { brainId: "org_brain1", user: { id: "u1", role: "admin" } };
      const body =
        opts.body && req.method !== "GET" ? opts.body.parse(await req.json()) : undefined;
      return handler(ctx, body);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET, POST } from "./route";

const fetchMock = vi.fn();
const req = (method: string, body?: unknown) =>
  new Request("http://x/api/settings/mcp-tokens", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ tokens: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("/api/settings/mcp-tokens", () => {
  it("lists tokens for the org brain and exposes the MCP endpoint", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.endpoint).toBe("http://engine.test/mcp");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.test/api/mcp-tokens");
    expect((init.headers as Record<string, string>)["x-subsumio-source"]).toBe("org_brain1");
  });

  it("creates a token and returns the one-time secret", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ name: "claude", token: "gbrain_abc" }), { status: 201 })
    );
    const res = await POST(req("POST", { name: "claude" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.token).toBe("gbrain_abc");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ name: "claude" });
  });

  it("rejects names with characters outside the allowlist", async () => {
    await expect(POST(req("POST", { name: "bad; DROP TABLE" }))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps engine errors instead of leaking them", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    expect((await GET(req("GET"))).status).toBe(502);
  });
});
