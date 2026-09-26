// @vitest-environment node
//
// The approval badges are counted by the engine (grouped fields) instead of
// listing every page. The counts must match what the approvals summary and
// its lists show — checked here against the list-based summary on the same
// data — and a failed or partial count must be reported, never read as "0".
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { loadApprovalCounts } from "./approval-counts";
import { loadApprovalSummary } from "./approval-summary";

type Fm = Record<string, unknown>;
type Row = { slug: string; type: string; title: string; frontmatter: Fm };

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const ME = "Me@Example.test";

let rows: Row[] = [];
let countCalls: URL[] = [];
let listCalls: URL[] = [];
let failCounts = false;
let incompleteCounts = false;

/** Postgres `->>` as text, lower-cased like the engine's grouping. */
function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** What GET /api/page-status-counts answers (same semantics as the SQL). */
function engineCounts(u: URL) {
  const p = u.searchParams;
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(",") : []);
  const types = list("types");
  const statusField = p.get("status_field") ?? "status";
  const groupFields = list("group_fields");
  const presentFields = list("present_fields");
  const dateFields = list("date_fields");
  const dateBefore = p.get("date_before");
  const fallback = p.get("date_fallback") !== "0";
  const arrayField = p.get("array_field");
  const groups = new Map<
    string,
    {
      type: string;
      status: string;
      count: number;
      before_count: number;
      pages: Set<string>;
      fields?: Record<string, string>;
      present?: Record<string, boolean>;
    }
  >();
  for (const r of rows) {
    if (!types.includes(r.type)) continue;
    if (text(r.frontmatter.status) === "tombstoned") continue;
    const sources: Fm[] = arrayField
      ? Array.isArray(r.frontmatter[arrayField])
        ? (r.frontmatter[arrayField] as unknown[]).filter(
            (e): e is Fm => typeof e === "object" && e !== null && !Array.isArray(e)
          )
        : []
      : [r.frontmatter];
    for (const src of sources) {
      const status = text(r.frontmatter[statusField]).toLowerCase();
      const fields = groupFields.length
        ? Object.fromEntries(groupFields.map((f) => [f, text(src[f]).toLowerCase()]))
        : undefined;
      const present = presentFields.length
        ? Object.fromEntries(presentFields.map((f) => [f, text(src[f]) !== ""]))
        : undefined;
      const key = JSON.stringify([r.type, status, fields, present]);
      const g = groups.get(key) ?? {
        type: r.type,
        status,
        count: 0,
        before_count: 0,
        pages: new Set<string>(),
        fields,
        present,
      };
      g.count++;
      g.pages.add(r.slug);
      if (dateBefore) {
        const date =
          dateFields.map((f) => text(src[f]).slice(0, 10)).find(Boolean) ??
          (fallback ? inDays(-30) : "");
        if (date && date <= dateBefore) g.before_count++;
      }
      groups.set(key, g);
    }
  }
  return {
    counts: [...groups.values()].map(({ pages, ...g }) => ({ ...g, page_count: pages.size })),
    complete: !incompleteCounts,
  };
}

beforeEach(() => {
  rows = [];
  countCalls = [];
  listCalls = [];
  failCounts = false;
  incompleteCounts = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/api/page-status-counts") {
        countCalls.push(u);
        if (failCounts) return new Response("busy", { status: 503 });
        return Response.json(engineCounts(u));
      }
      listCalls.push(u);
      const type = u.searchParams.get("type") ?? "";
      const all = rows.filter((r) => r.type === type);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Number(u.searchParams.get("limit"));
      return Response.json(all.slice(offset, offset + limit));
    })
  );
});

let n = 0;
function add(type: string, frontmatter: Fm) {
  n++;
  rows.push({ slug: `${type}/${n}`, type, title: `${type} ${n}`, frontmatter });
}

/** A firm with items in every category, plus settled ones that must not count. */
function seedFirm() {
  // Agent actions: pending (explicit and implicit) vs decided.
  add("agent_action", { status: "pending" });
  add("agent_action", {});
  add("agent_action", { status: "approved" });
  // Analyses: both review states, and a finished one.
  add("pipeline_state", { status: "awaiting_review" });
  add("pipeline_state", { status: "done" });
  // Time suggestions: mine (case-insensitive), someone else's, booked.
  add("time_suggestion", { status: "suggested", user_email: "me@example.test" });
  add("time_suggestion", { user_email: "ME@example.test" });
  add("time_suggestion", { status: "suggested", user_email: "other@example.test" });
  add("time_suggestion", { status: "booked", user_email: "me@example.test" });
  // Client submissions (urgent) vs reviewed.
  add("client_submission", {});
  add("client_submission", { review_status: "reviewed" });
  // Case scan results vs other agent runs.
  add("agent_run", { review_origin: "case_scan" });
  add("agent_run", { review_origin: "case_scan", review_status: "reviewed" });
  add("agent_run", { review_origin: "copilot" });
  // Document requests: draft without items, sent with an open item, sent with
  // all items received, fulfilled.
  add("document_request", { status: "draft" });
  add("document_request", {
    status: "sent",
    items: [{ label: "A" }, { label: "B" }, { label: "C", received_document_slug: "d/1" }],
  });
  add("document_request", {
    status: "sent",
    items: [{ label: "A", received_document_slug: "d/2" }],
  });
  add("document_request", { status: "fulfilled", items: [{ label: "A" }] });
  // AI deadlines: unreviewed far away, approved, done, tombstoned.
  add("legal_deadline", { due_date: "2099-06-01" });
  add("legal_deadline", { review_status: "approved", due_date: "2099-06-01" });
  add("legal_deadline", { status: "done", due_date: "2099-06-01" });
  add("legal_deadline", { status: "tombstoned", due_date: "2099-06-01" });
  // Matter arrays: suggested deadlines, parties, facts.
  add("legal_case", {
    suggested_deadlines: [
      { title: "a", due_date: "2099-01-01", confirmed: false },
      { title: "b", due_date: "2099-01-01", confirmed: true },
      { title: "c", due_date: "2099-01-01", review_status: "rejected" },
      null,
    ],
    suggested_parties: [
      { name: "X", role: "opponent", confirmed: false },
      { name: "Y", role: "court", confirmed: true },
    ],
    facts: [
      { id: "f1", statement: "s1" },
      { id: "f2", statement: "s2", review_status: "approved" },
      { id: "f3", statement: "s3", review_status: "party_assertion" },
      { id: "f4", statement: "s4", review_status: "pending" },
    ],
  });
  add("legal_case", { facts: "not a list" });
}

async function listCounts() {
  const s = await loadApprovalSummary({}, ME);
  return {
    byKey: Object.fromEntries(s.categories.map((c) => [c.key, c.count])),
    total: s.total,
    urgent: s.urgent > 0,
  };
}

describe("loadApprovalCounts", () => {
  test("every category matches the list-based summary on the same data", async () => {
    seedFirm();
    const fromLists = await listCounts();
    listCalls = [];
    const counted = await loadApprovalCounts({}, ME);
    expect(counted.byKey).toEqual(fromLists.byKey);
    expect(counted.total).toBe(fromLists.total);
    expect(counted.urgent).toBe(fromLists.urgent);
    expect(counted.incomplete).toEqual([]);
    expect(counted.byKey).toMatchObject({
      agent_actions: 2,
      analyses: 1,
      time: 2,
      case_scans: 1,
      requests: 2,
      deadlines: 2,
      // submission + party + two open facts
      client_input: 4,
    });
  });

  test("counted by the engine, never by listing pages", async () => {
    seedFirm();
    await loadApprovalCounts({}, ME);
    expect(listCalls).toHaveLength(0);
    expect(countCalls.length).toBeLessThanOrEqual(6);
  });

  test("urgency: due soon, overdue, marked high, or waiting for a human review", async () => {
    add("legal_deadline", { due_date: "2099-06-01" });
    expect((await loadApprovalCounts({}, ME)).urgent).toBe(false);
    for (const fm of [
      { due_date: inDays(1) },
      { date: inDays(-5) },
      { ai_confidence: "high", due_date: "2099-06-01" },
      { urgency: "critical" },
    ]) {
      rows = [];
      add("legal_deadline", fm);
      expect((await loadApprovalCounts({}, ME)).urgent).toBe(true);
      expect((await listCounts()).urgent).toBe(true);
    }
    rows = [];
    add("legal_case", { suggested_deadlines: [{ title: "x", due_date: inDays(2) }] });
    expect((await loadApprovalCounts({}, ME)).urgent).toBe(true);
    rows = [];
    add("pipeline_state", { status: "needs_human_review" });
    expect((await loadApprovalCounts({}, ME)).urgent).toBe(true);
  });

  test("an undated deadline is not urgent (no creation-day fallback)", async () => {
    add("legal_deadline", { title: "no date" });
    const counted = await loadApprovalCounts({}, ME);
    expect(counted.byKey.deadlines).toBe(1);
    expect(counted.urgent).toBe(false);
    expect(
      countCalls
        .find((u) => u.searchParams.get("types") === "legal_deadline")
        ?.searchParams.get("date_fallback")
    ).toBe("0");
  });

  test("a failed count marks every category incomplete", async () => {
    seedFirm();
    failCounts = true;
    const counted = await loadApprovalCounts({}, ME);
    expect(counted.incomplete.sort()).toEqual(
      [
        "agent_actions",
        "analyses",
        "case_scans",
        "client_input",
        "deadlines",
        "requests",
        "time",
      ].sort()
    );
  });

  test("a partial count is reported as incomplete", async () => {
    seedFirm();
    incompleteCounts = true;
    const counted = await loadApprovalCounts({}, ME);
    expect(counted.incomplete.length).toBeGreaterThan(0);
    expect(counted.total).toBeGreaterThan(0);
  });

  test("an engine that ignores the grouping fields counts as failed, not as data", async () => {
    seedFirm();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          counts: [{ type: "agent_action", status: "", count: 3, before_count: 0 }],
          complete: true,
        })
      )
    );
    const counted = await loadApprovalCounts({}, ME);
    expect(counted.incomplete).toContain("time");
    expect(counted.incomplete).toContain("requests");
    expect(counted.byKey.time).toBe(0);
  });
});
