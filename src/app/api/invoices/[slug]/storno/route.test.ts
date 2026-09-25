import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
const mockListEnginePages = vi.fn();
const mockAllocateInvoiceNumber = vi.fn(async (..._args: unknown[]) => "R-2026-0002");
const mockHighestInvoiceNumber = vi.fn((..._args: unknown[]) => 1);
const mockLogAudit = vi.fn(async (..._args: unknown[]) => undefined);

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockListEnginePages(...args),
}));
vi.mock("@/lib/invoice-numbering", () => ({
  allocateInvoiceNumber: (...args: unknown[]) => mockAllocateInvoiceNumber(...args),
  highestInvoiceNumber: (...args: unknown[]) => mockHighestInvoiceNumber(...args),
}));
vi.mock("@/lib/gobd", () => ({
  sha256Hex: vi.fn(async () => "hash"),
  gobdFrontmatter: vi.fn((hash: string, issuedAt: Date) => ({
    gobd_hash: hash,
    issued_at: issuedAt.toISOString(),
  })),
  invoiceContentString: vi.fn(() => "invoice-content"),
}));
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }));
const mockRelease = vi.fn(async (..._args: unknown[]) => ({ time: 2, expenses: 1 }));
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
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", email: "anwalt@example.com" },
    };
    return async (req: Request) => handler(ctx, {}, {}, req);
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

import { POST } from "./route";

const originalInvoice = {
  slug: "legal/invoices/R-2026-0001",
  frontmatter: {
    invoice_number: "R-2026-0001",
    client: "Max Muster",
    case_number: "2026-0001",
    date: "2026-01-15",
    items: [{ date: "2026-01-10", description: "Beratung", hours: 2, rate: 300, amount: 600 }],
    expenses: [{ date: "2026-01-11", description: "Gerichtsgebühr", amount: 50 }],
    status: "sent",
    subtotal: 600,
    expense_total: 50,
    advance_payment: 0,
    vat_rate: 20,
    tax: 130,
    total: 780,
  },
};

function post(slug = originalInvoice.slug) {
  const req = new Request(`http://localhost/api/invoices/${encodeURIComponent(slug)}/storno`, {
    method: "POST",
  }) as unknown as NextRequest;
  (req as unknown as { params: Promise<{ slug: string }> }).params = Promise.resolve({ slug });
  return POST(req);
}

describe("POST /api/invoices/[slug]/storno", () => {
  beforeEach(() => vi.clearAllMocks());

  test("rejects malformed slugs before touching the engine", async () => {
    const req = new Request("http://localhost/api/invoices/../secret/storno", {
      method: "POST",
    }) as unknown as NextRequest;
    (req as unknown as { params: Promise<{ slug: string }> }).params = Promise.resolve({
      slug: "..%2Fsecret",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 404 when the original invoice does not exist", async () => {
    mockFetch.mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const res = await post();
    expect(res.status).toBe(404);
    expect(mockListEnginePages).not.toHaveBeenCalled();
  });

  test.each(["draft", "cancelled"])("refuses storno for %s invoices", async (status) => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...originalInvoice,
          frontmatter: { ...originalInvoice.frontmatter, status },
        }),
        { status: 200 }
      )
    );
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockListEnginePages).not.toHaveBeenCalled();
  });

  test("refuses a storno of a storno note", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...originalInvoice,
          frontmatter: {
            ...originalInvoice.frontmatter,
            invoice_type: "storno",
          },
        }),
        { status: 200 }
      )
    );
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockListEnginePages).not.toHaveBeenCalled();
  });

  test("refuses a second storno of the same original invoice", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(originalInvoice), { status: 200 }));
    mockListEnginePages.mockResolvedValueOnce([
      {
        slug: "legal/invoices/storno-R-2026-0002",
        frontmatter: {
          invoice_type: "storno",
          invoice_number: "R-2026-0002",
          parent_invoice_id: originalInvoice.slug,
        },
      },
    ]);
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockAllocateInvoiceNumber).not.toHaveBeenCalled();
  });

  test("an invoice already stored at the storno slug is not replaced: 409", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(originalInvoice), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "page_exists" }), { status: 409 })
      );
    mockListEnginePages.mockResolvedValueOnce([originalInvoice]);
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_exists");
    expect(mockLogAudit).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  test("creates a negated storno note without changing the original", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(originalInvoice), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ slug: "storno" }), { status: 200 }));
    mockListEnginePages.mockResolvedValueOnce([originalInvoice]);

    const res = await post();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.invoice_number).toBe("R-2026-0002");

    expect(mockListEnginePages).toHaveBeenCalledWith(
      { "x-subsumio-source": "brain-at" },
      "invoice",
      5000
    );
    expect(mockAllocateInvoiceNumber).toHaveBeenCalledWith("brain-at", 2026, 1);

    const [createUrl, createInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(createUrl).toBe("http://engine-test:3001/api/pages");
    const payload = JSON.parse(String(createInit.body));
    expect(payload.slug).toBe("legal/invoices/storno-R-2026-0002");
    expect(payload.type).toBe("invoice");
    // Create-only: an invoice already stored at this slug is never replaced.
    expect(payload.if_absent).toBe(true);
    expect(payload.frontmatter).toMatchObject({
      invoice_type: "storno",
      parent_invoice_id: originalInvoice.slug,
      status: "draft",
      subtotal: -600,
      expense_total: -50,
      tax: -130,
      total: -780,
      gobd_hash: "hash",
    });
    expect(payload.frontmatter.items[0].amount).toBe(-600);
    expect(payload.frontmatter.expenses[0].amount).toBe(-50);
    expect(mockLogAudit).toHaveBeenCalledWith(
      "invoice.update",
      "invoice",
      expect.objectContaining({ entityId: "legal/invoices/storno-R-2026-0002" })
    );
    // GELD-9: the stornoed invoice's work is open again for a corrected invoice.
    expect(mockRelease).toHaveBeenCalledWith(
      { "x-subsumio-source": "brain-at" },
      originalInvoice.slug,
      expect.objectContaining({ invoice_number: "R-2026-0001" }),
      "storno"
    );
    expect(body.data.released).toEqual({ time: 2, expenses: 1 });
  });

  test("returns 503 when the storno page cannot be created", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(originalInvoice), { status: 200 }))
      .mockResolvedValueOnce(new Response("broken", { status: 500 }));
    mockListEnginePages.mockResolvedValueOnce([originalInvoice]);
    const res = await post();
    expect(res.status).toBe(503);
    // No storno note — the original still bills its work.
    expect(mockRelease).not.toHaveBeenCalled();
  });
});
