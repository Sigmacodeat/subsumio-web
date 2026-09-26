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
let countCalls: URL[] = [];
let countsComplete = true;

/** What the engine's count endpoint answers for the rows in `byType`. */
function engineCounts(u: URL) {
  const types = (u.searchParams.get("types") ?? "").split(",");
  const before = u.searchParams.get("date_before");
  const groups = new Map<string, { type: string; status: string; count: number; before_count: number }>();
  for (const type of types) {
    for (const row of byType[type] ?? []) {
      const status = String(row.frontmatter.status ?? "").toLowerCase();
      if (status === "tombstoned") continue;
      const key = `${type}|${status}`;
      const g = groups.get(key) ?? { type, status, count: 0, before_count: 0 };
      g.count++;
      const date = String(row.frontmatter.due_date ?? row.frontmatter.date ?? "");
      if (before && date && date.slice(0, 10) <= before) g.before_count++;
      groups.set(key, g);
    }
  }
  return { counts: [...groups.values()], complete: countsComplete };
}

function call(): Promise<{ data: Record<string, { count: number; variant: string; degraded?: boolean }> }> {
  return (GET as unknown as () => Promise<Response>)().then((r) => r.json());
}

beforeEach(() => {
  caller = `u-${Math.random()}@b.test`; // fresh cache key per test
  failTypes = new Set();
  listCalls = [];
  countCalls = [];
  countsComplete = true;
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
      if (u.pathname === "/api/page-status-counts") {
        countCalls.push(u);
        if (failTypes.has("counts")) return new Response("busy", { status: 503 });
        return Response.json(engineCounts(u));
      }
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

  test("counted badges come from one engine count, never from listing the pages", async () => {
    await call();
    expect(countCalls).toHaveLength(1);
    const u = countCalls[0]!;
    expect(u.searchParams.get("types")?.split(",").sort()).toEqual(
      ["intake_request", "invoice", "legal_deadline", "signature_request"].sort()
    );
    expect(u.searchParams.get("date_before")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const listedTypes = new Set(listCalls.map((l) => l.searchParams.get("type")));
    for (const t of ["legal_deadline", "intake_request", "signature_request", "invoice"]) {
      expect(listedTypes.has(t)).toBe(false);
    }
  });

  test("a deadline far in the future does not raise the badge; a closed one neither", async () => {
    byType.legal_deadline = [
      { slug: "d/far", frontmatter: { due_date: "2099-12-31", status: "open" } },
      { slug: "d/done", frontmatter: { due_date: overdue, status: "done" } },
      { slug: "d/due", frontmatter: { due_date: overdue, status: "open" } },
    ];
    const body = await call();
    expect(body.data["/dashboard/deadlines"]).toEqual({ count: 1, variant: "danger" });
  });

  test("parallel requests of one caller share one engine count", async () => {
    await Promise.all([call(), call(), call()]);
    expect(countCalls).toHaveLength(1);
    // Cached for the next tick, too.
    await call();
    expect(countCalls).toHaveLength(1);
  });

  test("an unreadable count marks the counted badges degraded, not 'nothing there'", async () => {
    failTypes.add("counts");
    const body = await call();
    expect(body.data["/dashboard/deadlines"]).toMatchObject({ degraded: true });
    expect(body.data["/dashboard/invoicing"]).toMatchObject({ degraded: true });
  });

  test("an incomplete engine count is shown as a lower bound", async () => {
    countsComplete = false;
    const body = await call();
    expect(body.data["/dashboard/deadlines"]).toMatchObject({
      count: TOTAL_DEADLINES,
      degraded: true,
    });
  });
});
