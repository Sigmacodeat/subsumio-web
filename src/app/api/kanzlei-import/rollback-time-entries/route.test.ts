// @vitest-environment node
//
// Taking back a Kanzlei data import removes exactly the time entries that
// import appended — also those imported as already billed in the previous
// system — and nothing an invoice of this system holds.
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
      handler(
        { headers: {}, brainId: "b", user: { id: "u1", email: "a@k.at", role: "assistant" } },
        await req.json()
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";

const IMPORT = "mig-abc";
let stored: { slug: string; type?: string; frontmatter: Record<string, unknown> } | null;
const forwarded: Array<Record<string, unknown>> = [];

/** Minimal engine: page read + page_array_mutate with the real unless semantics. */
function engine(_url: string, init?: RequestInit): Response {
  if (!init?.method || init.method === "GET") {
    return stored ? Response.json(stored) : new Response("{}", { status: 404 });
  }
  const body = JSON.parse(String(init.body)) as {
    field: string;
    match: string[];
    remove?: boolean;
    unless?: { eq?: Record<string, unknown>; ne?: Record<string, unknown> };
  };
  forwarded.push(body);
  const list = (stored?.frontmatter[body.field] as Array<Record<string, unknown>>) ?? [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const next: Array<Record<string, unknown>> = [];
  for (const e of list) {
    if (!body.match.includes(String(e.id))) {
      next.push(e);
      continue;
    }
    if (unlessMatches(e, body.unless)) {
      skipped.push(String(e.id));
      next.push(e);
      continue;
    }
    updated.push(String(e.id));
  }
  if (stored) stored.frontmatter[body.field] = next;
  return Response.json({ updated_ids: updated, skipped_ids: skipped, not_found_ids: [] });
}

beforeEach(() => {
  forwarded.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => engine(url, init))
  );
});

function call(body: Record<string, unknown>) {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/kanzlei-import/rollback-time-entries", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

const imported = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  minutes: 60,
  billed: false,
  source: "kanzlei-import",
  import_project_id: IMPORT,
  ...extra,
});

function ids(): string[] {
  return ((stored?.frontmatter.time_entries as Array<{ id: string }>) ?? []).map((e) => e.id);
}

describe("/api/kanzlei-import/rollback-time-entries", () => {
  beforeEach(() => {
    stored = {
      slug: "legal/cases/m",
      type: "legal_case",
      frontmatter: {
        status: "open",
        time_entries: [
          imported("open-1"),
          // Imported as billed in the previous system — no invoice here.
          imported("legacy-billed", { billed: true }),
          // Billed on an invoice of this system since the import.
          imported("invoiced", { billed: true, invoice_number: "RE-2026-7" }),
          // Another import's entry.
          imported("foreign", { billed: true, import_project_id: "mig-other" }),
          // Recorded here, billed here.
          { id: "own", minutes: 30, billed: true, invoice_number: "RE-2026-1" },
        ],
      },
    };
  });

  it("removes this import's entries, also legacy-billed ones, and keeps everything else", async () => {
    const res = await call({
      case_slug: "legal/cases/m",
      import_project_id: IMPORT,
      ids: ["open-1", "legacy-billed", "invoiced", "foreign", "own", "gone"],
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: { removed_ids: string[]; kept_ids: string[]; not_found_ids: string[] };
    };
    expect(data.removed_ids.sort()).toEqual(["legacy-billed", "open-1"]);
    expect(data.kept_ids.sort()).toEqual(["foreign", "invoiced", "own"]);
    expect(data.not_found_ids).toEqual(["gone"]);
    expect(ids()).toEqual(["invoiced", "foreign", "own"]);
    // Only the eligible ids reach the engine, with the invoice guard in-statement.
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]!.match).toEqual(["open-1", "legacy-billed"]);
    expect(forwarded[0]!.unless).toEqual({ ne: { invoice_number: "" } });
  });

  it("an entry invoiced between the check and the write stays (engine guard)", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        // An invoice claims the entry right before the atomic removal.
        const list = stored!.frontmatter.time_entries as Array<Record<string, unknown>>;
        list.find((e) => e.id === "legacy-billed")!.invoice_number = "RE-2026-9";
      }
      return engine(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({
      case_slug: "legal/cases/m",
      import_project_id: IMPORT,
      ids: ["legacy-billed"],
    });
    const { data } = (await res.json()) as { data: { removed_ids: string[]; kept_ids: string[] } };
    expect(data.removed_ids).toEqual([]);
    expect(data.kept_ids).toEqual(["legacy-billed"]);
    expect(ids()).toContain("legacy-billed");
  });

  it("nothing eligible → no engine write", async () => {
    const res = await call({
      case_slug: "legal/cases/m",
      import_project_id: IMPORT,
      ids: ["own", "invoiced"],
    });
    expect(res.status).toBe(200);
    expect(forwarded).toHaveLength(0);
    expect(ids()).toHaveLength(5);
  });

  it("an archived matter is not changed", async () => {
    stored!.frontmatter.status = "archived";
    const res = await call({
      case_slug: "legal/cases/m",
      import_project_id: IMPORT,
      ids: ["open-1"],
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(forwarded).toHaveLength(0);
  });

  it("an unreadable matter fails closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 }))
    );
    const res = await call({
      case_slug: "legal/cases/m",
      import_project_id: IMPORT,
      ids: ["open-1"],
    });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(forwarded).toHaveLength(0);
  });
});
