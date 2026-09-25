// @vitest-environment node
// Anderkonten-Liste (UIS-3-7): deleted accounts do not come back.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, q: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const q = Object.fromEntries(new URL(req.url).searchParams);
      return handler({ headers: {}, brainId: "b1", user: { role: "lawyer" } }, {}, q);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { GET } from "./route";

beforeEach(() => {
  const all = [
    { slug: "trust-accounts/1", frontmatter: { status: "active", matter_slug: "m1" } },
    { slug: "trust-accounts/2", frontmatter: { status: "tombstoned", matter_slug: "m1" } },
    { slug: "trust-accounts/3", frontmatter: { status: "closed", matter_slug: "m2" } },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
      return Response.json(offset === 0 ? all : []);
    })
  );
});

const get = (qs = "") =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request(`http://localhost/api/legal/trust-accounts${qs}`)
  );

describe("GET /api/legal/trust-accounts", () => {
  it("leaves deleted (tombstoned) accounts out", async () => {
    const body = (await (await get()).json()) as Array<{ slug: string }>;
    expect(body.map((a) => a.slug)).toEqual(["trust-accounts/1", "trust-accounts/3"]);
  });

  it("filters by matter and status on the server", async () => {
    const body = (await (await get("?matterSlug=m2")).json()) as Array<{ slug: string }>;
    expect(body.map((a) => a.slug)).toEqual(["trust-accounts/3"]);
    const active = (await (await get("?status=active")).json()) as Array<{ slug: string }>;
    expect(active.map((a) => a.slug)).toEqual(["trust-accounts/1"]);
  });
});
