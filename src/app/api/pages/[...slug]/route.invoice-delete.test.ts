// @vitest-environment node
// DELETE /api/pages/<slug> on an invoice draft releases its billed work, the
// same way DELETE /api/invoices/<slug> does.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();
const mockRelease = vi.fn();
const user = { id: "u1", email: "anwalt@example.com", name: "A", role: "lawyer" };

vi.mock("@/lib/invoice-billing-lock", () => ({
  releaseWorkOfInvoice: (...args: unknown[]) => mockRelease(...args),
}));

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
    return async (req: Request) => {
      const ctx = { headers: { "x-subsumio-source": "brain-at" }, brainId: "brain-at", user };
      const body = req.method === "PATCH" ? await req.json().catch(() => ({})) : {};
      return handler(ctx, body, {}, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiNotFound: (code: string) => Response.json({ error: code }, { status: 404 }),
}));

import { DELETE } from "./route";

let pages: Record<string, Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  pages = {};
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  mockRelease.mockResolvedValue({ time: 2, expenses: 1 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const slug = decodeURIComponent(String(url).replace("http://engine.test/api/pages/", ""));
      const page = pages[slug];
      if (page === undefined) return new Response("nf", { status: 404 });
      return Response.json(page);
    })
  );
});

function del(slug: string) {
  const req = new Request(`http://localhost/api/pages/${slug}`, { method: "DELETE" });
  (req as unknown as { params: Promise<{ slug: string[] }> }).params = Promise.resolve({
    slug: slug.split("/"),
  });
  return (DELETE as unknown as (r: Request) => Promise<Response>)(req);
}

describe("DELETE invoice draft via /api/pages", () => {
  it("tombstones the draft and releases its billed work", async () => {
    const fm = {
      status: "draft",
      invoice_number: "RE-2026-0007",
      case_slugs: ["legal/cases/m1"],
      time_entry_ids: ["te-1"],
    };
    pages["legal/invoices/r7"] = { slug: "legal/invoices/r7", type: "invoice", frontmatter: fm };
    const res = await del("legal/invoices/r7");
    expect(res.status).toBe(200);
    expect(mockPatch.mock.calls[0][1].frontmatter.status).toBe("tombstoned");
    expect(mockRelease).toHaveBeenCalledTimes(1);
    const [, slug, releasedFm, reason] = mockRelease.mock.calls[0];
    expect(slug).toBe("legal/invoices/r7");
    expect(releasedFm).toMatchObject({ invoice_number: "RE-2026-0007" });
    expect(reason).toBe("draft_deleted");
    expect((await res.json()).released).toEqual({ time: 2, expenses: 1 });
  });

  it("leaves an issued invoice untouched", async () => {
    pages["legal/invoices/r8"] = {
      slug: "legal/invoices/r8",
      type: "invoice",
      frontmatter: { status: "sent", invoice_number: "RE-2026-0008" },
    };
    const res = await del("legal/invoices/r8");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("does not release anything for other pages", async () => {
    pages["legal/documents/d1"] = {
      slug: "legal/documents/d1",
      type: "document",
      frontmatter: { status: "active" },
    };
    const res = await del("legal/documents/d1");
    expect(res.status).toBe(200);
    expect(mockRelease).not.toHaveBeenCalled();
    expect((await res.json()).released).toBeUndefined();
  });
});
