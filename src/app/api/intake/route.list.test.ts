// @vitest-environment node
// Intake list (OPS-9): complete past the engine's per-request cap, without
// deleted requests.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, q: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const query = Object.fromEntries(new URL(req.url).searchParams);
      return handler({ headers: {}, brainId: "b1", user: { role: "lawyer" } }, {}, query);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { GET } from "./route";

function page(i: number, status = "new") {
  return {
    slug: `legal/intake/i${i}`,
    title: `Anfrage ${i}`,
    type: "intake_request",
    frontmatter: {
      type: "intake_request",
      status,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    },
  };
}

beforeEach(() => {
  const all = Array.from({ length: 260 }, (_, i) => page(i));
  all[7] = page(7, "tombstoned");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Number(u.searchParams.get("limit") ?? 100);
      return Response.json(all.slice(offset, offset + Math.min(limit, 100)));
    })
  );
});

const get = (qs = "") =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request(`http://localhost/api/intake${qs}`)
  );

describe("GET /api/intake", () => {
  it("lists every request across engine pages, without deleted ones", async () => {
    const body = await (await get()).json();
    expect(body.total).toBe(259);
    expect(body.intakes).toHaveLength(259);
    expect(body.intakes.some((i: { slug: string }) => i.slug === "legal/intake/i7")).toBe(false);
  });

  it("an explicit limit trims the newest-first result, total stays complete", async () => {
    const body = await (await get("?limit=5")).json();
    expect(body.intakes).toHaveLength(5);
    expect(body.intakes[0].slug).toBe("legal/intake/i259");
    expect(body.total).toBe(259);
  });
});
