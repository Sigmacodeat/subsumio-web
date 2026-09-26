// @vitest-environment node
//
// The deadline badge counts EVERY critical/overdue deadline — the listing is
// sorted by last update, so the old 100-row cap hid long-standing deadlines.
// R11-2/R11-11: counts are cached per caller, deleted and finished records do
// not count, and an incomplete read is marked instead of passed off.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
const approvalCounts = vi.hoisted(() => ({
  value: null as null | {
    total: number;
    urgent: boolean;
    byKey: Record<string, number>;
    incomplete: string[];
  },
}));
vi.mock("@/lib/approval-counts", () => ({
  loadApprovalCounts: vi.fn(async () => {
    if (!approvalCounts.value) throw new Error("engine down");
    return approvalCounts.value;
  }),
}));
let caller = "a@b.test";
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, ...rest: unknown[]) => Promise<Response>) => () =>
      handler({
        headers: { "x-subsumio-source": "b", "x-caller": caller },
        user: { email: caller },
      }),
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
  const groupFields = (u.searchParams.get("group_fields") ?? "").split(",").filter(Boolean);
  const presentFields = (u.searchParams.get("present_fields") ?? "").split(",").filter(Boolean);
  const groups = new Map<
    string,
    {
      type: string;
      status: string;
      count: number;
      before_count: number;
      page_count: number;
      fields: Record<string, string>;
      present: Record<string, boolean>;
    }
  >();
  for (const type of types) {
    for (const row of byType[type] ?? []) {
      const status = String(row.frontmatter.status ?? "").toLowerCase();
      if (status === "tombstoned") continue;
      const fields = Object.fromEntries(
        groupFields.map((f) => [f, String(row.frontmatter[f] ?? "").toLowerCase()])
      );
      const present = Object.fromEntries(
        presentFields.map((f) => [f, String(row.frontmatter[f] ?? "") !== ""])
      );
      const key = JSON.stringify([type, status, fields, present]);
      const g = groups.get(key) ?? {
        type,
        status,
        count: 0,
        before_count: 0,
        page_count: 0,
        fields,
        present,
      };
      g.page_count++;
      g.count++;
      const date = String(row.frontmatter.due_date ?? row.frontmatter.date ?? "");
      if (before && date && date.slice(0, 10) <= before) g.before_count++;
      groups.set(key, g);
    }
  }
  return { counts: [...groups.values()], complete: countsComplete };
}

function call(): Promise<{
  data: Record<string, { count: number; variant: string; degraded?: boolean }>;
}> {
  return (GET as unknown as () => Promise<Response>)().then((r) => r.json());
}

beforeEach(() => {
  caller = `u-${Math.random()}@b.test`; // fresh cache key per test
  failTypes = new Set();
  listCalls = [];
  countCalls = [];
  countsComplete = true;
  approvalCounts.value = {
    total: 0,
    urgent: false,
    byKey: {
      deadlines: 0,
      client_input: 0,
      requests: 0,
      agent_actions: 0,
      analyses: 0,
      case_scans: 0,
      time: 0,
    },
    incomplete: [],
  };
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
    // One count for deadlines/intake/signatures/invoices, one for the vault.
    expect(countCalls).toHaveLength(2);
    expect(listCalls).toHaveLength(0);
    const u = countCalls.find((c) => c.searchParams.get("types")?.includes("legal_deadline"))!;
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
    expect(countCalls).toHaveLength(2);
    // Cached for the next tick, too.
    await call();
    expect(countCalls).toHaveLength(2);
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

  test("vault: every unassigned or unfinished document counts, beyond 2,000", async () => {
    byType.document = [
      ...Array.from({ length: 2_500 }, (_, i) => ({
        slug: `docs/u${i}`,
        frontmatter: { extraction_status: "done" },
      })),
      // assigned by matter, and by status
      { slug: "docs/a1", frontmatter: { case_slug: "cases/1", extraction_status: "done" } },
      { slug: "docs/a2", frontmatter: { assignment_status: "assigned" } },
      // assigned but OCR failed; unverified extraction
      { slug: "docs/g1", frontmatter: { case_slug: "cases/1", extraction_status: "ocr_failed" } },
      { slug: "docs/g2", frontmatter: { case_slug: "cases/1", extraction_unverified: true } },
      // both: unassigned and analysis pending (counts twice, as before)
      { slug: "docs/b", frontmatter: { analysis_status: "pending" } },
      { slug: "docs/t", frontmatter: { status: "tombstoned" } },
    ];
    byType.legal_document = [{ slug: "ld/1", frontmatter: { analysis_status: "failed" } }];
    const body = await call();
    // 2,500 unassigned + g1 + g2 + b twice + ld/1 twice
    expect(body.data["/dashboard/vault"]).toEqual({ count: 2_500 + 2 + 2 + 2, variant: "danger" });
    const vaultCall = countCalls.find((c) => c.searchParams.get("types")?.includes("document"));
    expect(vaultCall?.searchParams.get("present_fields")).toBe("case_slug");
    expect(listCalls).toHaveLength(0);
  });

  test("an unreadable vault count marks the vault badge degraded", async () => {
    failTypes.add("counts");
    const body = await call();
    expect(body.data["/dashboard/vault"]).toMatchObject({ degraded: true });
  });

  test("approvals: counts per list, danger when something is urgent", async () => {
    approvalCounts.value = {
      total: 9,
      urgent: true,
      byKey: {
        deadlines: 2,
        client_input: 1,
        requests: 1,
        agent_actions: 3,
        analyses: 1,
        case_scans: 0,
        time: 1,
      },
      incomplete: [],
    };
    const body = await call();
    expect(body.data["/dashboard/freigaben"]).toEqual({ count: 9, variant: "danger" });
    expect(body.data["/dashboard/communications"]).toEqual({ count: 4, variant: "warning" });
    expect(body.data["/dashboard/approvals"]).toEqual({ count: 3, variant: "warning" });
    expect(body.data["/dashboard/review-queue"]).toEqual({ count: 1, variant: "warning" });
    expect(body.data["/dashboard/time-suggestions"]).toEqual({ count: 1, variant: "info" });
  });

  test("approvals: a partial count degrades the total and the affected list only", async () => {
    approvalCounts.value = {
      total: 3,
      urgent: false,
      byKey: {
        deadlines: 0,
        client_input: 0,
        requests: 0,
        agent_actions: 3,
        analyses: 0,
        case_scans: 0,
        time: 0,
      },
      incomplete: ["time"],
    };
    const body = await call();
    expect(body.data["/dashboard/freigaben"]).toMatchObject({ count: 3, degraded: true });
    expect(body.data["/dashboard/time-suggestions"]).toMatchObject({ count: 0, degraded: true });
    expect(body.data["/dashboard/approvals"]).toEqual({ count: 3, variant: "warning" });
  });

  test("approvals: a failed count degrades every approval badge", async () => {
    approvalCounts.value = null;
    const body = await call();
    for (const href of [
      "/dashboard/freigaben",
      "/dashboard/communications",
      "/dashboard/approvals",
      "/dashboard/review-queue",
      "/dashboard/time-suggestions",
    ]) {
      expect(body.data[href]).toMatchObject({ degraded: true });
    }
  });
});
