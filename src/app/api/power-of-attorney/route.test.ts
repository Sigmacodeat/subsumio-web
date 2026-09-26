// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/engine-write", () => ({ engineWriteOrThrow: vi.fn() }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async () => [
    {
      slug: "legal/poa/poa-1",
      type: "power_of_attorney",
      frontmatter: { id: "poa-1", case_slug: "legal/intake/a", status: "signed" },
    },
    {
      slug: "legal/poa/poa-2",
      type: "power_of_attorney",
      frontmatter: { id: "poa-2", case_slug: "legal/cases/b", status: "draft" },
    },
  ],
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_o: unknown, handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler(
        { headers: {}, user: { id: "u", email: "a@k.at" } },
        undefined,
        Object.fromEntries(new URL(req.url).searchParams.entries())
      ),
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { GET } from "./route";

describe("GET /api/power-of-attorney", () => {
  it("filters by the matter (or intake) the record belongs to — the record is the frontmatter", async () => {
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/power-of-attorney?case_slug=legal%2Fintake%2Fa")
    );
    const body = await res.json();
    expect(body.data.items.map((p: { id: string }) => p.id)).toEqual(["poa-1"]);
    expect(body.data.validCount).toBe(1);
  });
});
