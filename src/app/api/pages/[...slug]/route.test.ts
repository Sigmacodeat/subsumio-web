// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();
const actor = vi.hoisted(() => ({ role: "lawyer" }));

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
    opts: {
      audit?: (
        ctx: unknown,
        body: unknown,
        query: unknown,
        req: Request
      ) => { action: string; entityType: string; entityId?: string; details?: unknown } | null;
    },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        headers: { "x-subsumio-source": "brain-at" },
        brainId: "brain-at",
        user: { id: "u1", email: "anwalt@example.com", name: "Anwalt", role: actor.role },
      };
      const body = req.method === "DELETE" ? {} : await req.json().catch(() => ({}));
      const res = await handler(ctx, body, {}, req);
      // Like the real createHandler: on success the audit spec is written
      // into the firm's protocol with the acting user.
      if (res.ok && opts.audit) {
        const spec = opts.audit(ctx, body, {}, req);
        if (spec) {
          const { logAudit } = await import("@/lib/audit");
          void logAudit(spec.action as never, spec.entityType, {
            entityId: spec.entityId,
            details: spec.details as never,
            brainId: ctx.brainId,
            userId: ctx.user.id,
            userEmail: ctx.user.email,
          });
        }
      }
      return res;
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
  actor.role = "lawyer";
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

describe("DELETE /api/pages/[...slug] — Audit-Zuordnung (OPS-10)", () => {
  it("logs a matter delete into the firm's protocol with the acting user", async () => {
    const { logAudit } = await import("@/lib/audit");
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: { status: "active" },
    };
    const res = await call("DELETE", "legal/cases/akte-1");
    expect(res.status).toBe(200);
    const entry = vi.mocked(logAudit).mock.calls.find((c) => c[0] === "case.delete");
    expect(entry?.[2]).toMatchObject({
      brainId: "brain-at",
      userId: "u1",
      userEmail: "anwalt@example.com",
      entityId: "legal/cases/akte-1",
    });
  });
});

describe("PATCH /api/pages/[...slug] — portal summary release", () => {
  const casePage = () => ({
    slug: "legal/cases/akte-1",
    type: "legal_case",
    frontmatter: { status: "active", portal_summary: "alt" },
  });

  it("refuses a portal summary change by a role that may not release portal text", async () => {
    actor.role = "assistant";
    stored = casePage();
    const res = await call("PATCH", "legal/cases/akte-1", {
      frontmatter: { portal_summary: "neu" },
    });
    expect(res.status).toBe(403);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("lets other roles save the matter when the summary is unchanged", async () => {
    actor.role = "assistant";
    stored = casePage();
    const res = await call("PATCH", "legal/cases/akte-1", {
      frontmatter: { portal_summary: "alt", tags: ["x"] },
    });
    expect(res.status).toBe(200);
  });

  it("lets a lawyer release the summary", async () => {
    stored = casePage();
    const res = await call("PATCH", "legal/cases/akte-1", {
      frontmatter: { portal_summary: "neu" },
    });
    expect(res.status).toBe(200);
    expect(written()?.frontmatter?.portal_summary).toBe("neu");
  });
});

describe("DELETE /api/pages/[...slug] — Aktenabschluss ist kein Löschen (§ 12 RAO, § 132 BAO)", () => {
  function del(slug: string, query = "") {
    const req = new Request(`http://localhost/api/pages/${slug}${query}`, { method: "DELETE" });
    (req as unknown as { params: Promise<{ slug: string[] }> }).params = Promise.resolve({
      slug: slug.split("/"),
    });
    return (DELETE as unknown as (r: Request) => Promise<Response>)(req);
  }

  it("archiving stores the closing date and the retention end, and is no tombstone", async () => {
    stored = { slug: "legal/cases/akte-1", type: "legal_case", frontmatter: { status: "open" } };
    const res = await del("legal/cases/akte-1");
    expect(res.status).toBe(200);
    expect((await res.json()).method).toBe("archived");
    const fm = written()!.frontmatter!;
    expect(fm.status).toBe("archived");
    expect(typeof fm.closed_at).toBe("string");
    const year = new Date().getFullYear();
    expect(fm.retention_until).toBe(`${year + 7}-12-31`);
    expect(fm).not.toHaveProperty("tombstoned_at");
  });

  it("keeps an earlier closing date as the start of the period", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: { status: "settled", closed_at: "2020-03-05" },
    };
    const res = await del("legal/cases/akte-1");
    expect(res.status).toBe(200);
    expect(written()!.frontmatter).toMatchObject({
      closed_at: "2020-03-05",
      retention_until: "2027-12-31",
    });
  });

  it("refuses to move a closed matter to the Papierkorb while the period runs", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: { status: "archived", archived_at: new Date().toISOString() },
    };
    const res = await del("legal/cases/akte-1", "?mode=trash");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("retention_period_running");
    expect(body.message).toMatch(/Aufbewahrungspflicht/);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("refuses the Papierkorb for a matter under legal hold", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: { status: "open", legal_hold: true },
    };
    const res = await del("legal/cases/akte-1", "?mode=trash");
    expect(res.status).toBe(423);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("moves a matter created by mistake to the Papierkorb", async () => {
    stored = { slug: "legal/cases/akte-1", type: "legal_case", frontmatter: { status: "open" } };
    const res = await del("legal/cases/akte-1", "?mode=trash");
    expect(res.status).toBe(200);
    expect((await res.json()).method).toBe("deleted");
    expect(written()!.frontmatter).toMatchObject({
      status: "tombstoned",
      status_before_delete: "open",
      tombstone_reason: "manual_delete",
    });
  });

  it("lets a matter whose period has run go to the Papierkorb", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: {
        status: "archived",
        archived_at: "2010-01-10",
        closed_at: "2010-01-10",
        retention_until: "2017-12-31",
      },
    };
    const res = await del("legal/cases/akte-1", "?mode=trash");
    expect(res.status).toBe(200);
    expect(written()!.frontmatter).toMatchObject({
      status: "tombstoned",
      status_before_delete: "archived",
    });
  });
});
