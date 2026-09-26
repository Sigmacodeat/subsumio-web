// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

const handlerOpts = vi.hoisted(() => ({ value: undefined as Record<string, unknown> | undefined }));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/usage", () => ({ recordQuery: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (opts: Record<string, unknown>, handler: (ctx: unknown, b: unknown, q: unknown) => Promise<Response>) => {
      handlerOpts.value = opts;
      return (q: unknown) => handler({ headers: { "x-subsumio-source": "b" }, brainId: "b" }, {}, q);
    },
}));

import { GET } from "./route";

describe("GET /api/search/palette", () => {
  test("one request: one quota booking by the guard, all sections served server-side", async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        urls.push(u);
        if (u.searchParams.get("type") === "contact") return new Response("x", { status: 502 });
        return Response.json([{ slug: `hit-${u.searchParams.get("type") ?? "all"}` }]);
      })
    );
    const res = await (GET as unknown as (q: unknown) => Promise<Response>)({ q: "Müller" });
    const body = (await res.json()) as Record<string, unknown>;
    // The route declares the quota once; it never books again itself.
    expect(handlerOpts.value?.quota).toBe("queries");
    expect(urls).toHaveLength(5);
    expect(body.cases).toEqual([{ slug: "hit-case" }]);
    expect(body.contacts).toEqual([]);
    expect(body.failed).toEqual(["contacts"]);
  });
});
