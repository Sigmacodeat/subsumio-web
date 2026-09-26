// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/usage", () => ({ recordQuery: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  createHandler:
    (_o: unknown, handler: (ctx: unknown, b: unknown, q: unknown) => Promise<Response>) =>
    (q: unknown) =>
      handler({ headers: { "x-subsumio-source": "b" }, brainId: "b", user: { id: "u-me" } }, {}, q),
}));

import { GET } from "./route";

describe("GET /api/search (R8-5)", () => {
  it("does not return a colleague's personal calendar mirror", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname.startsWith("/api/pages/")) {
          const slug = decodeURIComponent(u.pathname.slice("/api/pages/".length));
          return Response.json({
            slug,
            type: "calendar_event",
            frontmatter: { owner_user_id: slug.includes("kollege") ? "u-other" : "u-me" },
          });
        }
        return Response.json([
          { slug: "calendar/outlook/kollege@k.at/1", type: "calendar_event", title: "Therapie" },
          { slug: "calendar/outlook/me@k.at/2", type: "calendar_event", title: "Eigener" },
          { slug: "legal/cases/a", type: "legal_case", title: "Akte" },
        ]);
      })
    );
    const res = await (GET as unknown as (q: unknown) => Promise<Response>)({ q: "x", limit: 10 });
    const body = (await res.json()) as Array<{ slug: string }>;
    expect(body.map((h) => h.slug)).toEqual(["calendar/outlook/me@k.at/2", "legal/cases/a"]);
    expect(JSON.stringify(body)).not.toContain("Therapie");
  });
});
