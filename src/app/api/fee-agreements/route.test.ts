// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async () =>
    Array.from({ length: 250 }, (_, i) => ({
      slug: `legal/fee-agreements/f-${i}`,
      frontmatter: { id: `f-${i}`, case_slug: i === 240 ? "cases/x" : "cases/y", model: "hourly" },
    })),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_o: unknown, handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler(
        { headers: {}, brainId: "b", user: { id: "u1" } },
        {},
        Object.fromEntries(new URL(req.url).searchParams)
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET } from "./route";

describe("GET /api/fee-agreements (GELD-25)", () => {
  it("filters by case_slug on the agreement fields, past the first 200", async () => {
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/fee-agreements?case_slug=cases/x")
    );
    const { data } = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe("f-240");
  });
});
