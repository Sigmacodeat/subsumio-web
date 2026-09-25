// @vitest-environment node
// KYC list (OPS-9): complete past the engine's per-request cap, without
// deleted records.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, q: unknown) => Promise<Response>
  ) => {
    return async () => handler({ headers: {}, brainId: "b1", user: { role: "lawyer" } }, {}, {});
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET } from "./route";

function page(i: number, status = "in_progress") {
  return {
    slug: `legal/kyc/k${i}`,
    frontmatter: { id: `k${i}`, status, case_slug: "legal/cases/m", updated_at: "2026-09-01" },
  };
}

beforeEach(() => {
  const all = Array.from({ length: 250 }, (_, i) => page(i));
  // One deleted record — must not come back.
  all[3] = { ...page(3), frontmatter: { ...page(3).frontmatter, status: "tombstoned" } };
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

describe("GET /api/kyc", () => {
  it("returns every record across engine pages and drops tombstoned ones", async () => {
    const res = await (GET as unknown as () => Promise<Response>)();
    const body = await res.json();
    expect(body.data.items).toHaveLength(249);
    expect(body.data.items.some((v: { id: string }) => v.id === "k3")).toBe(false);
  });

  it("a failed engine read is an error, not an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 }))
    );
    const res = await (GET as unknown as () => Promise<Response>)();
    expect(res.status).toBe(502);
  });
});
