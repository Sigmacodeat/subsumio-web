// @vitest-environment node
//
// The deadline badge counts EVERY critical/overdue deadline — the listing is
// sorted by last update, so the old 100-row cap hid long-standing deadlines.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/approval-summary", () => ({ loadApprovalSummary: vi.fn(async () => null) }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, ...rest: unknown[]) => Promise<Response>) => () =>
      handler({ headers: { "x-subsumio-source": "b" }, user: { email: "a@b.test" } }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET } from "./route";

const overdue = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
const TOTAL_DEADLINES = 250;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get("type") !== "legal_deadline") return Response.json([]);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Number(u.searchParams.get("limit"));
      const n = Math.max(0, Math.min(limit, TOTAL_DEADLINES - offset));
      return Response.json(
        Array.from({ length: n }, (_, i) => ({
          slug: `legal/deadlines/d${offset + i}`,
          frontmatter: { due_date: overdue, status: "open" },
        }))
      );
    })
  );
});

describe("dashboard badges", () => {
  test("counts every overdue deadline, beyond the first 100", async () => {
    const res = await (GET as unknown as () => Promise<Response>)();
    const body = (await res.json()) as {
      data: Record<string, { count: number; variant: string }>;
    };
    expect(body.data["/dashboard/deadlines"]).toEqual({
      count: TOTAL_DEADLINES,
      variant: "danger",
    });
  });
});
