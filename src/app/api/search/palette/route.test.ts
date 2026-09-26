// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

const handlerOpts = vi.hoisted(() => ({ value: undefined as Record<string, unknown> | undefined }));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/usage", () => ({ recordQuery: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: Record<string, unknown>,
    handler: (ctx: unknown, b: unknown, q: unknown) => Promise<Response>
  ) => {
    handlerOpts.value = opts;
    return (q: unknown) =>
      handler({ headers: { "x-subsumio-source": "b" }, brainId: "b", user: { id: "u-me" } }, {}, q);
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

  test("colleagues' personal calendar mirrors are dropped from every section (R8-5)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname.startsWith("/api/pages/")) {
          const slug = decodeURIComponent(u.pathname.slice("/api/pages/".length));
          const owner = slug.includes("kollegin") ? "u-other" : "u-me";
          return Response.json({
            slug,
            type: "calendar_event",
            frontmatter: { owner_user_id: owner },
          });
        }
        return Response.json([
          { slug: "calendar/outlook/kollegin@k.at/E1", type: "calendar_event", title: "Arzt" },
          { slug: "calendar/outlook/me@k.at/E2", type: "calendar_event", title: "Mein Termin" },
          { slug: "legal/cases/a", type: "legal_case", title: "Akte" },
        ]);
      })
    );
    const res = await (GET as unknown as (q: unknown) => Promise<Response>)({ q: "Termin" });
    const body = (await res.json()) as { results: Array<{ slug: string }> };
    expect(body.results.map((r) => r.slug)).toEqual([
      "calendar/outlook/me@k.at/E2",
      "legal/cases/a",
    ]);
  });
});
