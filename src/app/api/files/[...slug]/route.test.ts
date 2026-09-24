// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://mock-engine:3001" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      _opts: unknown,
      handler: (ctx: unknown, body: unknown, q: unknown, req: unknown) => Promise<Response>
    ) =>
    async (req: Request, routeCtx: { params: Promise<{ slug: string[] }> }) => {
      const ctx = { headers: { "x-subsumio-source": "firm-a" }, user: { id: "u1" } };
      // The real handler exposes route params on the request object.
      const r = Object.assign(req, { params: routeCtx.params });
      return handler(ctx, null, null, r);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiNotFound: (code: string) => Response.json({ error: code }, { status: 404 }),
}));

import { GET } from "./route";

function stubEngineFile(contentType: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("<script>alert(1)</script>", {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": 'attachment; filename="doc"',
          },
        })
    )
  );
}

async function get(url: string) {
  return (GET as unknown as (req: Request, ctx: unknown) => Promise<Response>)(new Request(url), {
    params: Promise.resolve({ slug: ["legal", "docs", "doc"] }),
  });
}

describe("GET /api/files/[...slug] response hardening", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("never serves uploaded HTML inline, even with ?inline=1", async () => {
    stubEngineFile("text/html");
    const res = await get("http://localhost/api/files/legal/docs/doc?inline=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toMatch(/sandbox/);
  });

  it("never serves SVG inline", async () => {
    stubEngineFile("image/svg+xml");
    const res = await get("http://localhost/api/files/legal/docs/doc?inline=1");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/);
  });

  it("serves PDF inline for the preview with nosniff and no sandbox", async () => {
    stubEngineFile("application/pdf");
    const res = await get("http://localhost/api/files/legal/docs/doc?inline=1");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).not.toMatch(/sandbox/);
  });
});
