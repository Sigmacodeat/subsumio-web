// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const mockRelease = vi.fn(async (..._args: unknown[]) => ({ time: 2, expenses: 0 }));
vi.mock("@/lib/invoice-billing-lock", () => ({
  releaseWorkOfInvoice: (...args: unknown[]) => mockRelease(...args),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const body = req.method === "PATCH" ? await req.json() : {};
      return handler({ headers: {}, brainId: "b", user: { id: "u1" } }, body, {}, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { DELETE, PATCH } from "./route";

let stored: unknown;
let readStatus = 200;

beforeEach(() => {
  vi.clearAllMocks();
  readStatus = 200;
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      readStatus === 200 ? Response.json(stored) : new Response("{}", { status: readStatus })
    )
  );
});

function call(method: "PATCH" | "DELETE", body?: unknown) {
  const slug = "legal/invoices/r-1";
  const req = new Request(`http://localhost/api/invoices/${encodeURIComponent(slug)}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  (req as unknown as { params: Promise<{ slug: string }> }).params = Promise.resolve({
    slug: encodeURIComponent(slug),
  });
  const fn = (method === "PATCH" ? PATCH : DELETE) as unknown as (r: Request) => Promise<Response>;
  return fn(req);
}

const sent = {
  slug: "legal/invoices/r-1",
  type: "invoice",
  frontmatter: { status: "sent", total: 1 },
};

describe("/api/invoices/[slug]", () => {
  it("marks a sent invoice paid (payment transitions keep working)", async () => {
    stored = sent;
    const res = await call("PATCH", { status: "paid", paid_at: "2026-09-23", paid_amount: 1 });
    expect(res.status).toBe(200);
    expect(mockPatch).toHaveBeenCalledOnce();
  });

  it("records e-invoice delivery status on a sent invoice", async () => {
    stored = sent;
    expect((await call("PATCH", { e_invoice_status: "delivered" })).status).toBe(200);
  });

  it("refuses to change the amount of a sent invoice", async () => {
    stored = sent;
    const res = await call("PATCH", { total: 99 });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("refuses to cancel a sent invoice without a Storno-Note", async () => {
    stored = sent;
    expect((await call("PATCH", { status: "cancelled" })).status).toBe(409);
  });

  it("fails closed when the invoice cannot be read", async () => {
    readStatus = 500;
    expect((await call("PATCH", { total: 99 })).status).toBe(503);
    expect((await call("DELETE")).status).toBe(503);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("deletes drafts only", async () => {
    stored = { ...sent, frontmatter: { status: "cancelled" } };
    expect((await call("DELETE")).status).toBe(409);
    expect(mockRelease).not.toHaveBeenCalled();
    stored = { ...sent, frontmatter: { status: "draft" } };
    expect((await call("DELETE")).status).toBe(200);
  });

  it("releases the billed work of a deleted draft (GELD-9)", async () => {
    const fm = {
      status: "draft",
      invoice_number: "R-1",
      case_slugs: ["cases/a"],
      time_entry_ids: ["te-1", "te-2"],
    };
    stored = { ...sent, frontmatter: fm };
    const res = await call("DELETE");
    expect(res.status).toBe(200);
    expect(mockRelease).toHaveBeenCalledWith({}, "legal/invoices/r-1", fm, "draft_deleted");
    expect((await res.json()).released).toEqual({ time: 2, expenses: 0 });
  });

  it("does not release anything when the delete itself fails", async () => {
    stored = { ...sent, frontmatter: { status: "draft", invoice_number: "R-1" } };
    mockPatch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect((await call("DELETE")).status).toBe(503);
    expect(mockRelease).not.toHaveBeenCalled();
  });
});
