// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { unlessMatches } from "@/lib/billing-write-guards";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler({ headers: {}, brainId: "b", user: { id: "u1" } }, await req.json()),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { POST } from "./route";

let stored: { slug: string; type?: string; frontmatter: Record<string, unknown> } | null;
let readStatus = 200;
const forwarded: Array<Record<string, unknown>> = [];

/** Minimal engine: page read + page_array_mutate with the real unless semantics. */
function engine(url: string, init?: RequestInit): Response {
  if (!init?.method || init.method === "GET") {
    if (readStatus !== 200) return new Response("{}", { status: readStatus });
    return stored ? Response.json(stored) : new Response("{}", { status: 404 });
  }
  const body = JSON.parse(String(init.body)) as {
    field: string;
    match: string[];
    set?: Record<string, unknown>;
    remove?: boolean;
    unless?: { eq?: Record<string, unknown>; ne?: Record<string, unknown> };
  };
  forwarded.push(body);
  const list = (stored?.frontmatter[body.field] as Array<Record<string, unknown>>) ?? [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const next: Array<Record<string, unknown>> = [];
  for (const e of list) {
    const hit = body.match.includes(String(e.id));
    if (!hit) {
      next.push(e);
      continue;
    }
    if (unlessMatches(e, body.unless)) {
      skipped.push(String(e.id));
      next.push(e);
      continue;
    }
    updated.push(String(e.id));
    if (!body.remove) next.push({ ...e, ...body.set });
  }
  if (stored) stored.frontmatter[body.field] = next;
  return Response.json({
    matched_ids: [...updated, ...skipped],
    updated_ids: updated,
    skipped_ids: skipped,
    not_found_ids: [],
    items: next,
  });
}

beforeEach(() => {
  readStatus = 200;
  forwarded.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => engine(url, init))
  );
});

function call(body: Record<string, unknown>) {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/pages/array-mutate", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

describe("/api/pages/array-mutate billing guards", () => {
  it("refuses to patch the items of a sent invoice", async () => {
    stored = {
      slug: "legal/invoices/r-1",
      type: "invoice",
      frontmatter: { status: "sent", items: [{ description: "Beratung", amount: 100 }] },
    };
    const res = await call({
      slug: "legal/invoices/r-1",
      field: "items",
      match: ["Beratung"],
      match_key: "description",
      set: { amount: 0 },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_finalized");
    expect(forwarded).toHaveLength(0);
  });

  it("skips a billed time entry even when the client sends no guard", async () => {
    stored = {
      slug: "cases/a",
      type: "legal_case",
      frontmatter: {
        time_entries: [{ id: "te-1", minutes: 60, billed: true, invoice_number: "R-1" }],
      },
    };
    const res = await call({
      slug: "cases/a",
      field: "time_entries",
      match: ["te-1"],
      remove: true,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped_ids).toEqual(["te-1"]);
    expect(forwarded[0].unless).toEqual({ eq: { billed: true } });
    expect((stored.frontmatter.time_entries as unknown[]).length).toBe(1);
  });

  it("refuses to clear the billed flag", async () => {
    stored = {
      slug: "cases/a",
      type: "legal_case",
      frontmatter: { time_entries: [{ id: "te-1", billed: true, invoice_number: "R-1" }] },
    };
    const res = await call({
      slug: "cases/a",
      field: "time_entries",
      match: ["te-1"],
      set: { billed: false },
    });
    expect(res.status).toBe(409);
    expect(forwarded).toHaveLength(0);
  });

  it("still edits open entries", async () => {
    stored = {
      slug: "cases/a",
      type: "legal_case",
      frontmatter: { time_entries: [{ id: "te-2", minutes: 10, billed: false }] },
    };
    const res = await call({
      slug: "cases/a",
      field: "time_entries",
      match: ["te-2"],
      set: { minutes: 20 },
    });
    expect((await res.json()).updated_ids).toEqual(["te-2"]);
  });

  it("fails closed when the page cannot be read", async () => {
    readStatus = 500;
    stored = null;
    const res = await call({ slug: "cases/a", field: "time_entries", match: ["x"], remove: true });
    expect(res.status).toBe(503);
    expect(forwarded).toHaveLength(0);
  });
});
