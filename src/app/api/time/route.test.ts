import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockGetPage = vi.fn();
const mockUpdatePage = vi.fn();
const mockAppend = vi.fn(async (..._a: unknown[]) => ({}));

vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    getPage: (...args: unknown[]) => mockGetPage(...args),
    updatePage: (...args: unknown[]) => mockUpdatePage(...args),
    appendPageArray: (...args: unknown[]) => mockAppend(...args),
  }),
}));

vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      audit?: (ctx: unknown, body: unknown) => unknown;
    },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) => {
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(ctx, parsed?.data ?? raw, undefined, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

import { PATCH, DELETE, POST } from "./route";

function call(fn: (req: NextRequest) => Promise<Response>, method: string, body: unknown) {
  return fn(
    new Request("http://localhost/api/time", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

const patch = (body: unknown) => call(PATCH, "PATCH", body);
const del = (body: unknown) => call(DELETE, "DELETE", body);

const STANDALONE_PAGE = {
  slug: "time-entries/u1/1000-abc",
  frontmatter: {
    description: "Timer: Recherche",
    minutes: 45,
    date: "2026-09-20",
    billable: true,
    billed: false,
    is_auto_generated: true,
    case_slug: "case-1",
  },
};

describe("PATCH /api/time — schema validation", () => {
  beforeEach(() => vi.clearAllMocks());

  test("rejects non-numeric minutes (was: passed .passthrough() into time_entries)", async () => {
    const res = await patch({ case_slug: "c1", id: "e1", minutes: "abc" });
    expect(res.status).toBe(400);
  });

  test("rejects negative minutes and rate", async () => {
    expect((await patch({ case_slug: "c1", id: "e1", minutes: -50 })).status).toBe(400);
    expect((await patch({ case_slug: "c1", id: "e1", rate: -1 })).status).toBe(400);
  });

  test("rejects minutes above one calendar day", async () => {
    expect((await patch({ case_slug: "c1", id: "e1", minutes: 2000 })).status).toBe(400);
  });

  test("rejects a non-ISO date", async () => {
    expect((await patch({ case_slug: "c1", id: "e1", date: "xyz" })).status).toBe(400);
  });

  test("matter entries still require case_slug", async () => {
    mockGetPage.mockResolvedValue({ frontmatter: {} });
    const res = await patch({ id: "e1", description: "x" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/time — standalone time_entry pages", () => {
  beforeEach(() => vi.clearAllMocks());

  test("updates the standalone page frontmatter (id IS the slug)", async () => {
    mockGetPage.mockResolvedValue(STANDALONE_PAGE);
    mockUpdatePage.mockResolvedValue({});

    const res = await patch({
      id: "time-entries/u1/1000-abc",
      description: "Timer: Recherche korrigiert",
      minutes: 60,
    });

    expect(res.status).toBe(200);
    expect(mockGetPage).toHaveBeenCalledWith("time-entries/u1/1000-abc");
    expect(mockUpdatePage).toHaveBeenCalledTimes(1);
    const written = mockUpdatePage.mock.calls[0]![0] as {
      slug: string;
      frontmatter: Record<string, unknown>;
    };
    expect(written.slug).toBe("time-entries/u1/1000-abc");
    expect(written.frontmatter.description).toBe("Timer: Recherche korrigiert");
    expect(written.frontmatter.minutes).toBe(60);
    // untouched fields preserved
    expect(written.frontmatter.is_auto_generated).toBe(true);

    const body = await res.json();
    expect(body.data.entry.id).toBe("time-entries/u1/1000-abc");
    expect(body.data.entry.minutes).toBe(60);
  });

  test("case_slug: '' (what the UI sends for timer entries) is treated as absent", async () => {
    mockGetPage.mockResolvedValue(STANDALONE_PAGE);
    mockUpdatePage.mockResolvedValue({});
    const res = await patch({
      id: "time-entries/u1/1000-abc",
      case_slug: "",
      minutes: 30,
    });
    expect(res.status).toBe(200);
    expect(mockUpdatePage).toHaveBeenCalledTimes(1);
  });

  test("billed standalone entries are immutable (409)", async () => {
    mockGetPage.mockResolvedValue({
      slug: "time-entries/u1/1000-abc",
      frontmatter: { ...STANDALONE_PAGE.frontmatter, billed: true },
    });
    const res = await patch({ id: "time-entries/u1/1000-abc", minutes: 30 });
    expect(res.status).toBe(409);
    expect(mockUpdatePage).not.toHaveBeenCalled();
  });

  test("missing standalone page → 404", async () => {
    mockGetPage.mockRejectedValue(new Error("not found"));
    const res = await patch({ id: "time-entries/u1/none", minutes: 30 });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/time — standalone time_entry pages", () => {
  beforeEach(() => vi.clearAllMocks());

  test("tombstones the page instead of removing it", async () => {
    mockGetPage.mockResolvedValue(STANDALONE_PAGE);
    mockUpdatePage.mockResolvedValue({});

    const res = await del({ id: "time-entries/u1/1000-abc" });
    expect(res.status).toBe(200);

    const written = mockUpdatePage.mock.calls[0]![0] as {
      slug: string;
      frontmatter: Record<string, unknown>;
    };
    expect(written.frontmatter.status).toBe("tombstoned");
    // fields kept for audit
    expect(written.frontmatter.description).toBe("Timer: Recherche");
  });

  test("billed standalone entries cannot be deleted (409)", async () => {
    mockGetPage.mockResolvedValue({
      slug: "time-entries/u1/1000-abc",
      frontmatter: { ...STANDALONE_PAGE.frontmatter, billed: true },
    });
    const res = await del({ id: "time-entries/u1/1000-abc" });
    expect(res.status).toBe(409);
    expect(mockUpdatePage).not.toHaveBeenCalled();
  });

  test("matter entries still require case_slug", async () => {
    const res = await del({ id: "e1" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/time — Tarifleistung (W4-09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPage.mockResolvedValue({ slug: "legal/cases/a", frontmatter: {} });
  });
  const post = (body: unknown) => call(POST, "POST", body);
  const base = {
    case_slug: "legal/cases/a",
    description: "Klage — BG 12.000 €",
    date: "2026-09-24",
  };

  test("a Tarifleistung is stored with its amount and without an hourly rate", async () => {
    const res = await post({
      ...base,
      minutes: 90,
      rate: 250,
      tariff: { system: "ratg", amount: 431.104, basis: 12000, label: "Klage TP 3A" },
    });
    expect(res.status).toBe(201);
    const [, field, entries] = mockAppend.mock.calls[0] as [
      string,
      string,
      Array<Record<string, unknown>>,
    ];
    expect(field).toBe("time_entries");
    expect(entries[0]).toMatchObject({
      minutes: 90,
      billed: false,
      tariff: { system: "ratg", amount: 431.1, basis: 12000, label: "Klage TP 3A" },
    });
    expect(entries[0].rate).toBeUndefined();
  });

  test("a Tarifleistung may be recorded without time spent", async () => {
    const res = await post({
      ...base,
      minutes: 0,
      tariff: { system: "ahk", amount: 120, label: "Einheitssatz" },
    });
    expect(res.status).toBe(201);
  });

  test("an hourly entry still needs minutes", async () => {
    const res = await post({ ...base, minutes: 0 });
    expect(res.status).toBe(400);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  test("a tariff without a positive amount is refused", async () => {
    const res = await post({
      ...base,
      minutes: 10,
      tariff: { system: "ratg", amount: 0, label: "x" },
    });
    expect(res.status).toBe(400);
  });
});
