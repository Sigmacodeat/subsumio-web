// @vitest-environment node
//
// The deadline badge counts EVERY critical/overdue deadline — the listing is
// sorted by last update, so the old 100-row cap hid long-standing deadlines.
// R11-2/R11-11: counts are cached per caller, deleted and finished records do
// not count, and an incomplete read is marked instead of passed off.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/approval-summary", () => ({
  loadApprovalSummary: vi.fn(async () => ({ categories: [], total: 0, urgent: 0 })),
}));
let caller = "a@b.test";
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, ...rest: unknown[]) => Promise<Response>) => () =>
      handler({ headers: { "x-subsumio-source": "b", "x-caller": caller }, user: { email: caller } }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET } from "./route";

const overdue = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
const TOTAL_DEADLINES = 250;
type Row = { slug: string; frontmatter: Record<string, unknown> };
let byType: Record<string, Row[]> = {};
let failTypes = new Set<string>();
let listCalls: URL[] = [];

function call(): Promise<{ data: Record<string, { count: number; variant: string; degraded?: boolean }> }> {
  return (GET as unknown as () => Promise<Response>)().then((r) => r.json());
}

beforeEach(() => {
  caller = `u-${Math.random()}@b.test`; // fresh cache key per test
  failTypes = new Set();
  listCalls = [];
  byType = {
    legal_deadline: Array.from({ length: TOTAL_DEADLINES }, (_, i) => ({
      slug: `legal/deadlines/d${i}`,
      frontmatter: { due_date: overdue, status: "open" },
    })),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      listCalls.push(u);
      const type = u.searchParams.get("type") ?? "";
      if (failTypes.has(type)) return new Response("busy", { status: 503 });
      const rows = byType[type] ?? [];
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Number(u.searchParams.get("limit"));
      return Response.json(rows.slice(offset, offset + limit));
    })
  );
});

describe("dashboard badges", () => {
  test("counts every overdue deadline, beyond the first 100", async () => {
    const body = await call();
    expect(body.data["/dashboard/deadlines"]).toEqual({
      count: TOTAL_DEADLINES,
      variant: "danger",
    });
  });

  test("intake: only open requests count — not deleted or finished ones, no 50 cap", async () => {
    const statuses = [
      ...Array(30).fill("tombstoned"),
      ...Array(40).fill("converted"),
      ...Array(50).fill("new"),
    ];
    byType.intake_request = statuses.map((status, i) => ({
      slug: `legal/intake/i${i}`,
      frontmatter: { status },
    }));
    const body = await call();
    expect(body.data["/dashboard/intake"]?.count).toBe(50);
  });

  test("a deleted invoice does not raise the invoice badge", async () => {
    byType.invoice = [
      { slug: "inv/1", frontmatter: { status: "sent" } },
      { slug: "inv/2", frontmatter: { status: "tombstoned" } },
    ];
    const body = await call();
    expect(body.data["/dashboard/invoicing"]?.count).toBe(1);
  });

  test("parallel requests of one caller share one engine scan", async () => {
    await Promise.all([call(), call(), call()]);
    const firstDeadlineBatches = listCalls.filter(
      (u) =>
        u.searchParams.get("type") === "legal_deadline" && (u.searchParams.get("offset") ?? "0") === "0"
    );
    expect(firstDeadlineBatches).toHaveLength(1);
    // Cached for the next tick, too.
    await call();
    expect(
      listCalls.filter(
        (u) =>
          u.searchParams.get("type") === "legal_deadline" &&
          (u.searchParams.get("offset") ?? "0") === "0"
      )
    ).toHaveLength(1);
  });

  test("an unreadable deadline list is marked degraded, not shown as 'no deadlines'", async () => {
    failTypes.add("legal_deadline");
    const body = await call();
    expect(body.data["/dashboard/deadlines"]).toMatchObject({ degraded: true });
  });
});
