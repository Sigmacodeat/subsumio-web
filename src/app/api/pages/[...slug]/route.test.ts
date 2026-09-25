// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", email: "anwalt@example.com", name: "Anwalt", role: "lawyer" },
    };
    return async (req: Request) => {
      const body = req.method === "DELETE" ? {} : await req.json().catch(() => ({}));
      return handler(ctx, body, {}, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiNotFound: (code: string) => Response.json({ error: code }, { status: 404 }),
}));

import { DELETE, PATCH } from "./route";

let stored: Record<string, unknown> | null;
let readStatus = 200;

beforeEach(() => {
  vi.clearAllMocks();
  readStatus = 200;
  stored = null;
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      readStatus === 200
        ? Response.json(stored)
        : new Response(JSON.stringify({ error: "x" }), { status: readStatus })
    )
  );
});

function call(method: "PATCH" | "DELETE", slug: string, body?: unknown) {
  const req = new Request(`http://localhost/api/pages/${slug}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  (req as unknown as { params: Promise<{ slug: string[] }> }).params = Promise.resolve({
    slug: slug.split("/"),
  });
  return method === "PATCH"
    ? (PATCH as unknown as (r: Request) => Promise<Response>)(req)
    : (DELETE as unknown as (r: Request) => Promise<Response>)(req);
}

const written = () =>
  (mockPatch.mock.calls[0]?.[1] ?? null) as { frontmatter?: Record<string, unknown> } | null;

describe("PATCH /api/pages/[...slug] — Vier-Augen-Kontrolle", () => {
  it("rejects done on a Notfrist although the client sends its own second_check_by", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", is_notfrist: true },
    };
    const res = await call("PATCH", "legal/deadlines/f1", {
      frontmatter: {
        status: "done",
        second_check_by: "Anwalt",
        second_check_at: "2026-09-23T00:00:00Z",
      },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("notfrist_second_check_required");
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("rejects a Notfrist marked done inside a matter's deadline list", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: {
        status: "active",
        deadlines: [{ id: "d1", title: "Berufung", status: "pending", is_notfrist: true }],
      },
    };
    const res = await call("PATCH", "legal/cases/akte-1", {
      frontmatter: {
        deadlines: [
          {
            id: "d1",
            title: "Berufung",
            status: "done",
            is_notfrist: true,
            second_check_by: "Anwalt",
            second_check_at: "2026-09-23T00:00:00Z",
          },
        ],
      },
    });
    expect(res.status).toBe(403);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("strips client second_check fields from ordinary edits and keeps the stored stamp", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: {
        deadlines: [
          {
            id: "d1",
            title: "Berufung",
            status: "done",
            is_notfrist: true,
            second_check_by: "Kollegin",
            second_check_at: "2026-09-20T10:00:00Z",
          },
        ],
      },
    };
    const res = await call("PATCH", "legal/cases/akte-1", {
      frontmatter: {
        deadlines: [{ id: "d1", title: "Berufung", status: "done", is_notfrist: true }],
        second_check_by: "Anwalt",
      },
    });
    expect(res.status).toBe(200);
    const fm = written()?.frontmatter ?? {};
    expect(fm.second_check_by).toBeUndefined();
    expect((fm.deadlines as Array<Record<string, unknown>>)[0]).toMatchObject({
      second_check_by: "Kollegin",
      second_check_at: "2026-09-20T10:00:00Z",
    });
  });

  it("refuses to write when the stored page cannot be read (fail closed)", async () => {
    readStatus = 500;
    const res = await call("PATCH", "legal/deadlines/f1", { frontmatter: { status: "done" } });
    expect(res.status).toBe(503);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe("PATCH/DELETE /api/pages/[...slug] — ausgestellte Rechnungen", () => {
  const sentInvoice = {
    slug: "legal/invoices/r-1",
    type: "invoice",
    title: "Rechnung R-1",
    frontmatter: { status: "sent", total: 780, invoice_number: "R-1" },
  };

  it("rejects a content change on a sent invoice", async () => {
    stored = sentInvoice;
    const res = await call("PATCH", "legal/invoices/r-1", { frontmatter: { total: 10 } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_finalized");
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("lets a sent invoice be marked paid", async () => {
    stored = sentInvoice;
    const res = await call("PATCH", "legal/invoices/r-1", {
      frontmatter: { status: "paid", paid_at: "2026-09-23", paid_amount: 780 },
    });
    expect(res.status).toBe(200);
    expect(written()?.frontmatter).toMatchObject({ status: "paid" });
  });

  it("refuses to delete a paid invoice", async () => {
    stored = { ...sentInvoice, frontmatter: { ...sentInvoice.frontmatter, status: "paid" } };
    const res = await call("DELETE", "legal/invoices/r-1");
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("still deletes a draft invoice", async () => {
    stored = { ...sentInvoice, frontmatter: { ...sentInvoice.frontmatter, status: "draft" } };
    const res = await call("DELETE", "legal/invoices/r-1");
    expect(res.status).toBe(200);
    expect(written()?.frontmatter).toMatchObject({ status: "tombstoned" });
  });
});

describe("PATCH /api/pages/[...slug] — billed work (GELD-1)", () => {
  const matter = () => ({
    slug: "cases/a",
    type: "legal_case",
    frontmatter: {
      status: "active",
      time_entries: [
        { id: "te-1", minutes: 60, billed: true, invoice_number: "R-1" },
        { id: "te-2", minutes: 15, billed: false },
      ],
    },
  });

  it("refuses dropping a billed time entry through a whole-list save", async () => {
    stored = matter();
    const res = await call("PATCH", "cases/a", {
      frontmatter: { time_entries: [{ id: "te-2", minutes: 15, billed: false }] },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("entry_billed");
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("refuses un-billing through a whole-list save", async () => {
    stored = matter();
    const res = await call("PATCH", "cases/a", {
      frontmatter: {
        time_entries: [
          { id: "te-1", minutes: 60, billed: false },
          { id: "te-2", minutes: 15, billed: false },
        ],
      },
    });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("still saves a list that keeps the billed entry unchanged", async () => {
    stored = matter();
    const res = await call("PATCH", "cases/a", {
      frontmatter: {
        time_entries: [
          { id: "te-1", minutes: 60, billed: true, invoice_number: "R-1" },
          { id: "te-3", minutes: 5, billed: false },
        ],
      },
    });
    expect(res.status).toBe(200);
  });
});

describe("PATCH/DELETE /api/pages/[...slug] — Fristen (C6)", () => {
  it("FRI-7: DELETE of a live Notfrist page is refused (403) — nothing tombstoned", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", is_notfrist: true, due_date: "2026-03-30" },
    };
    const res = await call("DELETE", "legal/deadlines/f1");
    expect(res.status).toBe(403);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("FRI-15: DELETE of an ordinary deadline is logged as deadline.delete with the old date", async () => {
    const { logAudit } = await import("@/lib/audit");
    stored = {
      slug: "legal/deadlines/f2",
      type: "legal_deadline",
      frontmatter: { status: "pending", due_date: "2026-04-01" },
    };
    const res = await call("DELETE", "legal/deadlines/f2");
    expect(res.status).toBe(200);
    const call0 = vi.mocked(logAudit).mock.calls.find((c) => c[0] === "deadline.delete");
    expect(call0?.[2]).toMatchObject({
      entityId: "legal/deadlines/f2",
      userId: "u1",
      details: { due_date_before: "2026-04-01" },
    });
  });

  it("FRI-7: PATCH moving a Notfrist in a matter without a reason is refused", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: {
        deadlines: [{ id: "d1", title: "Berufung", due_date: "2026-03-30", is_notfrist: true }],
      },
    };
    const res = await call("PATCH", "legal/cases/akte-1", {
      frontmatter: {
        deadlines: [{ id: "d1", title: "Berufung", due_date: "2026-04-30", is_notfrist: true }],
      },
    });
    expect(res.status).toBe(422);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("FRI-8: without If-Match the version advances from the STORED version, not a client value", async () => {
    stored = { slug: "legal/cases/akte-1", type: "legal_case", frontmatter: { version: 9 } };
    const res = await call("PATCH", "legal/cases/akte-1", {
      frontmatter: { priority: "high", version: 1 },
    });
    expect(res.status).toBe(200);
    expect(written()?.frontmatter?.version).toBe(10);
  });
});
