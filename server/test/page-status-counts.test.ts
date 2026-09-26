/**
 * Counting pages per type and status for the dashboard badges
 * (count_pages_by_status, GET /api/page-status-counts): one SQL count instead
 * of a page listing, bound to the caller's source, document ACL and matter
 * access; deleted and tombstoned pages never count.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { addGroupMember, createAccessGroup, setPagePermission } from "../src/core/acl.ts";
import {
  aggregateCountRows,
  validateCountOpts,
  type PageStatusCount,
} from "../src/core/page-status-counts.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-counts";
const OTHER = "firm-counts-other";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;
let groupId = "";

function headers(userId: string, role: string) {
  return {
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": SOURCE,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: SOURCE, matterScope: "all", userId, role },
      SECRET
    ),
  };
}

async function counts(
  h: Record<string, string>,
  qs = "types=legal_deadline,invoice&date_fields=due_date&date_before=2030-01-31"
): Promise<{ counts: PageStatusCount[]; complete: boolean }> {
  const res = await fetch(`${base}/api/page-status-counts?${qs}`, { headers: h });
  expect(res.status).toBe(200);
  return (await res.json()) as { counts: PageStatusCount[]; complete: boolean };
}

const total = (rows: PageStatusCount[], type: string, status?: string) =>
  rows
    .filter((r) => r.type === type && (status === undefined || r.status === status))
    .reduce((n, r) => n + r.count, 0);
const before = (rows: PageStatusCount[], type: string, status: string) =>
  rows
    .filter((r) => r.type === type && r.status === status)
    .reduce((n, r) => n + r.before_count, 0);

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  for (const src of [SOURCE, OTHER]) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [src]
    );
  }
  const put = (slug: string, type: string, fm: Record<string, unknown>, sourceId = SOURCE) =>
    engine.putPage(
      slug,
      { type: type as never, title: slug, compiled_truth: "x", frontmatter: fm },
      { sourceId }
    );
  await put("cases/open", "legal_case", {});
  await put("cases/walled", "legal_case", { permissions: { blocked_users: ["u-walled"] } });
  // Deadlines: 2 open due soon, 1 open far away, 1 done, 1 tombstoned, 1 deleted,
  // 1 restricted by ACL, 1 in the walled matter, 1 in another firm.
  await put("d/soon-1", "legal_deadline", {
    status: "open",
    due_date: "2030-01-10",
    case_slug: "cases/open",
  });
  await put("d/soon-2", "legal_deadline", { status: "Open", due_date: "2030-01-31" });
  await put("d/far", "legal_deadline", { status: "open", due_date: "2031-06-01" });
  await put("d/done", "legal_deadline", { status: "done", due_date: "2030-01-05" });
  await put("d/tomb", "legal_deadline", { status: "tombstoned", due_date: "2030-01-05" });
  await put("d/deleted", "legal_deadline", { status: "open", due_date: "2030-01-05" });
  await engine.softDeletePage("d/deleted", { sourceId: SOURCE });
  await put("d/acl", "legal_deadline", { status: "open", due_date: "2030-01-06" });
  await put("d/walled", "legal_deadline", {
    status: "open",
    due_date: "2030-01-07",
    case_slug: "cases/walled",
  });
  await put("d/other-firm", "legal_deadline", { status: "open", due_date: "2030-01-05" }, OTHER);
  await put("inv/1", "invoice", { status: "sent" });
  // Multi-field and array counts.
  await put("bd/1", "badge_doc", {
    review_status: "Approved",
    case_slug: "cases/open",
    due_date: "2030-01-02",
  });
  await put("bd/2", "badge_doc", {});
  await put("bd/3", "badge_doc", { case_slug: "" });
  await put("bc/1", "badge_case", {
    suggested_deadlines: [
      { title: "a", due_date: "2030-01-05" },
      { title: "b", due_date: "2031-01-05" },
      { title: "c", review_status: "approved" },
      null,
      "not an object",
    ],
  });
  await put("bc/2", "badge_case", { suggested_deadlines: [{ title: "d" }] });
  await put("bc/3", "badge_case", { suggested_deadlines: "no array" });
  await put("bc/walled", "badge_case", {
    case_slug: "cases/walled",
    suggested_deadlines: [{ title: "w" }],
  });

  const g = await createAccessGroup(engine, SOURCE, "Partner");
  groupId = g.id;
  await addGroupMember(engine, g.id, "u-member", SOURCE);
  const acl = await engine.getPage("d/acl", { sourceId: SOURCE });
  expect(await setPagePermission(engine, acl!.id, g.id, "read", SOURCE)).toBe(true);
  invalidateMatterAccess(SOURCE);

  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await engine?.disconnect();
  releaseEnv?.();
}, 60_000);

describe("engine.countPagesByStatus", () => {
  test("source, ACL, tombstones, deleted pages and the date cut-off", async () => {
    const rows = await engine.countPagesByStatus({
      types: ["legal_deadline"],
      dateFields: ["due_date"],
      dateBefore: "2030-01-31",
      sourceId: SOURCE,
      aclGroups: [],
    });
    // open: soon-1, soon-2 (status lower-cased), far, walled — not acl, not other firm
    expect(total(rows, "legal_deadline", "open")).toBe(4);
    expect(before(rows, "legal_deadline", "open")).toBe(3);
    expect(total(rows, "legal_deadline", "done")).toBe(1);
    expect(total(rows, "legal_deadline", "tombstoned")).toBe(0);
    const member = await engine.countPagesByStatus({
      types: ["legal_deadline"],
      sourceId: SOURCE,
      aclGroups: [groupId],
    });
    expect(total(member, "legal_deadline", "open")).toBe(5);
  });

  test("option validation and row aggregation", () => {
    expect(validateCountOpts({ types: [] })).toBe("types_required");
    expect(validateCountOpts({ types: ["x; drop"] })).toBe("invalid_type");
    expect(validateCountOpts({ types: ["a"], statusField: "a->b" })).toBe("invalid_status_field");
    expect(validateCountOpts({ types: ["a"], dateBefore: "tomorrow" })).toBe("invalid_date_before");
    expect(
      aggregateCountRows([
        { type: "a", status: "open", before: true },
        { type: "a", status: "open", before: false },
        { type: "a", status: "done", before: "t" },
      ])
    ).toEqual([
      { type: "a", status: "done", count: 1, before_count: 1, page_count: 1 },
      { type: "a", status: "open", count: 2, before_count: 1, page_count: 2 },
    ]);
    expect(validateCountOpts({ types: ["a"], groupFields: ["x'"] })).toBe("invalid_group_field");
    expect(validateCountOpts({ types: ["a"], presentFields: ["a", "b", "c", "d"] })).toBe(
      "too_many_present_fields"
    );
    expect(validateCountOpts({ types: ["a"], arrayField: "a->b" })).toBe("invalid_array_field");
    // Element rows of one page count once in page_count.
    expect(
      aggregateCountRows(
        [
          { page_id: 1, type: "a", status: "s", g0: "x", p0: false },
          { page_id: 1, type: "a", status: "s", g0: "x", p0: false },
          { page_id: 2, type: "a", status: "s", g0: "x", p0: true },
        ],
        { groupFields: ["k"], presentFields: ["r"] }
      )
    ).toEqual([
      {
        type: "a",
        status: "s",
        count: 2,
        before_count: 0,
        page_count: 1,
        fields: { k: "x" },
        present: { r: false },
      },
      {
        type: "a",
        status: "s",
        count: 1,
        before_count: 0,
        page_count: 1,
        fields: { k: "x" },
        present: { r: true },
      },
    ]);
  });

  test("further group fields, presence fields and dates without creation-day fallback", async () => {
    const rows = await engine.countPagesByStatus({
      types: ["badge_doc"],
      groupFields: ["review_status"],
      presentFields: ["case_slug"],
      dateFields: ["due_date"],
      dateBefore: "2030-01-31",
      dateFallback: false,
      sourceId: SOURCE,
    });
    const pick = (review: string, filed: boolean) =>
      rows.find((r) => r.fields?.review_status === review && r.present?.case_slug === filed);
    expect(pick("approved", true)).toMatchObject({ count: 1, before_count: 1, page_count: 1 });
    // No due date: never "before" without the creation-day fallback.
    expect(pick("", false)).toMatchObject({ count: 2, before_count: 0 });
  });

  test("array mode counts object elements, page_count distinct pages", async () => {
    const rows = await engine.countPagesByStatus({
      types: ["badge_case"],
      arrayField: "suggested_deadlines",
      groupFields: ["review_status"],
      dateFields: ["due_date"],
      dateBefore: "2030-01-31",
      dateFallback: false,
      sourceId: SOURCE,
    });
    const open = rows.filter((r) => r.fields?.review_status === "");
    // a, b (bc/1), d (bc/2), w (bc/walled); null and string elements do not count.
    expect(open.reduce((n, r) => n + r.count, 0)).toBe(4);
    expect(open.reduce((n, r) => n + r.page_count, 0)).toBe(3);
    expect(open.reduce((n, r) => n + r.before_count, 0)).toBe(1);
    expect(rows.find((r) => r.fields?.review_status === "approved")?.count).toBe(1);
  });
});

describe("GET /api/page-status-counts", () => {
  test("admin: every live page of the firm, none of another firm", async () => {
    const r = await counts(headers("u-admin", "admin"));
    expect(r.complete).toBe(true);
    // soon-1, soon-2, far, acl, walled
    expect(total(r.counts, "legal_deadline", "open")).toBe(5);
    expect(before(r.counts, "legal_deadline", "open")).toBe(4);
    expect(total(r.counts, "invoice", "sent")).toBe(1);
  });

  test("a user in no group does not count ACL-restricted pages", async () => {
    const r = await counts(headers("u-nogroup", "lawyer"));
    expect(total(r.counts, "legal_deadline", "open")).toBe(4);
  });

  test("a walled user does not count pages of the walled matter", async () => {
    const r = await counts(headers("u-walled", "lawyer"));
    // not acl (no group), not walled
    expect(total(r.counts, "legal_deadline", "open")).toBe(3);
    expect(before(r.counts, "legal_deadline", "open")).toBe(2);
  });

  test("array mode over HTTP honours the matter restriction", async () => {
    const qs = "types=badge_case&array_field=suggested_deadlines&group_fields=review_status";
    const admin = await counts(headers("u-admin", "admin"), qs);
    const open = (r: { counts: PageStatusCount[] }) =>
      r.counts.filter((c) => c.fields?.review_status === "").reduce((n, c) => n + c.count, 0);
    expect(open(admin)).toBe(4);
    const walled = await counts(headers("u-walled", "lawyer"), qs);
    expect(walled.complete).toBe(true);
    expect(open(walled)).toBe(3);
    expect(
      walled.counts
        .filter((c) => c.fields?.review_status === "")
        .reduce((n, c) => n + c.page_count, 0)
    ).toBe(2);
  });

  test("invalid parameters answer 400", async () => {
    const res = await fetch(`${base}/api/page-status-counts?types=`, {
      headers: headers("u-admin", "admin"),
    });
    expect(res.status).toBe(400);
    const bad = await fetch(`${base}/api/page-status-counts?types=a&status_field=x%27--`, {
      headers: headers("u-admin", "admin"),
    });
    expect(bad.status).toBe(400);
  });
});
