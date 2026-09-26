import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockGetPage = vi.fn();
const mockLoadSettings = vi.fn(async () => ({
  kanzleiName: "Kanzlei Test",
  ustId: "ATU12345678",
  country: "AT",
  zip: "1010",
  city: "Wien",
}));
const mockSendEInvoice = vi.fn(async (_channel?: string, _xml?: string, _opts?: unknown) => ({
  status: "queued",
  channel: "peppol",
  reference: "ref-1",
  message: "eingereiht",
}));

const mockUpdatePage = vi.fn(async (..._a: unknown[]) => ({ slug: "x" }));
const mockCreateOpenItem = vi.fn(async (..._a: unknown[]) => ({ created: true }));
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    getPage: (...a: unknown[]) => mockGetPage(...a),
    updatePage: (...a: unknown[]) => mockUpdatePage(...a),
  }),
}));
vi.mock("@/lib/open-items", () => ({
  createOpenItemForInvoice: (...a: unknown[]) => mockCreateOpenItem(...a),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: () => mockLoadSettings(),
}));
vi.mock("@/lib/e-invoice/transport", () => ({
  sendEInvoice: (c?: string, x?: string, o?: unknown) => mockSendEInvoice(c, x, o),
  pollEInvoiceStatus: vi.fn(async () => ({ status: "delivered" })),
  transportAvailability: vi.fn(() => ({ peppol: true })),
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
const locks = new Set<string>();
beforeEach(() => {
  locks.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (locks.has(body.slug)) return Response.json({ error: "page_exists" }, { status: 409 });
      locks.add(body.slug);
      return Response.json({ success: true });
    })
  );
});
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
    return async (req: Request) => {
      const body = req.method === "POST" ? await req.json() : {};
      return handler(ctx, body, {}, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

import { POST } from "./route";

const storedInvoice = {
  slug: "legal/invoices/R-2026-0001",
  frontmatter: {
    invoice_number: "R-2026-0001",
    client: "Bautec GmbH",
    client_address: "Bautec GmbH\nHauptstraße 1\n1010 Wien",
    date: "2026-01-15",
    items: [{ date: "2026-01-10", description: "Beratung", hours: 2, rate: 300, amount: 600 }],
    subtotal: 600,
    tax: 120,
    total: 720,
    vat_rate: 20,
    bank: { name: "Bank", iban: "AT611904300234573201" },
  },
};

function post(body: Record<string, unknown>) {
  const req = new Request("http://localhost/api/e-invoice/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return POST(req);
}

describe("POST /api/e-invoice/send", () => {
  beforeEach(() => vi.clearAllMocks());

  test("builds XML from the STORED invoice — client-supplied data is ignored", async () => {
    mockGetPage.mockResolvedValueOnce(storedInvoice);
    const res = await post({
      channel: "peppol",
      format: "xrechnung",
      invoiceSlug: "legal/invoices/R-2026-0001",
      // Manipulierte Felder — dürfen nicht in die XML gelangen:
      invoice: { invoice_number: "FAKE", bank: { iban: "AT999999999999999999" } },
      settings: { kanzleiName: "Angreifer OG" },
    });
    expect(res.status).toBe(200);
    const [channel, xml] = mockSendEInvoice.mock.calls[0] as unknown as [string, string, unknown];
    expect(channel).toBe("peppol");
    expect(xml).toContain("R-2026-0001");
    expect(xml).toContain("Bautec GmbH");
    expect(xml).toContain("Kanzlei Test");
    expect(xml).toContain("AT611904300234573201");
    expect(xml).not.toContain("FAKE");
    expect(xml).not.toContain("AT999999999999999999");
    expect(xml).not.toContain("Angreifer");
  });

  test("returns 404 when the invoice does not exist", async () => {
    mockGetPage.mockRejectedValueOnce(new Error("404"));
    const res = await post({
      channel: "peppol",
      format: "xrechnung",
      invoiceSlug: "legal/invoices/fehlt",
    });
    expect(res.status).toBe(404);
    expect(mockSendEInvoice).not.toHaveBeenCalled();
  });

  test("returns 400 when the page is not an invoice", async () => {
    mockGetPage.mockResolvedValueOnce({
      slug: "legal/cases/x",
      frontmatter: { type: "case", title: "Akte" },
    });
    const res = await post({
      channel: "peppol",
      format: "xrechnung",
      invoiceSlug: "legal/cases/x",
    });
    expect(res.status).toBe(400);
    expect(mockSendEInvoice).not.toHaveBeenCalled();
  });
});

describe("POST /api/e-invoice/send — a draft is issued, never sent loose (GELD-14)", () => {
  beforeEach(() => vi.clearAllMocks());

  test("a delivered draft becomes sent and gets an open item", async () => {
    mockGetPage.mockResolvedValueOnce({
      ...storedInvoice,
      frontmatter: { ...storedInvoice.frontmatter, status: "draft" },
    });
    const res = await post({
      channel: "peppol",
      format: "xrechnung",
      invoiceSlug: "legal/invoices/R-2026-0001",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.issued).toBe(true);
    const [update] = mockUpdatePage.mock.calls[0] as [{ frontmatter: Record<string, unknown> }];
    expect(update.frontmatter.status).toBe("sent");
    expect(update.frontmatter.e_invoice_reference).toBe("ref-1");
    expect(mockCreateOpenItem).toHaveBeenCalledOnce();
  });

  test("a draft whose sums do not add up is not delivered (409)", async () => {
    mockGetPage.mockResolvedValueOnce({
      ...storedInvoice,
      frontmatter: { ...storedInvoice.frontmatter, status: "draft", total: 1 },
    });
    const res = await post({
      channel: "peppol",
      format: "xrechnung",
      invoiceSlug: "legal/invoices/R-2026-0001",
    });
    expect(res.status).toBe(409);
    expect(mockSendEInvoice).not.toHaveBeenCalled();
    expect(mockUpdatePage).not.toHaveBeenCalled();
  });

  test("an already issued invoice is only re-delivered, not re-issued", async () => {
    mockGetPage.mockResolvedValueOnce({
      ...storedInvoice,
      frontmatter: { ...storedInvoice.frontmatter, status: "sent" },
    });
    const res = await post({
      channel: "peppol",
      format: "xrechnung",
      invoiceSlug: "legal/invoices/R-2026-0001",
    });
    expect(res.status).toBe(200);
    // Only the delivery reference is recorded; the status stays.
    const [update] = mockUpdatePage.mock.calls[0] as [{ frontmatter: Record<string, unknown> }];
    expect(update.frontmatter.status).toBeUndefined();
    expect(update.frontmatter.e_invoice_reference).toBe("ref-1");
    expect(mockCreateOpenItem).not.toHaveBeenCalled();
  });
});

describe("POST /api/e-invoice/send — validation and double submission (R8-15)", () => {
  beforeEach(() => vi.clearAllMocks());
  const sentInvoice = {
    ...storedInvoice,
    frontmatter: { ...storedInvoice.frontmatter, status: "sent" },
  };
  const body = {
    channel: "peppol",
    format: "xrechnung",
    invoiceSlug: "legal/invoices/R-2026-0001",
  };

  test("an incomplete e-invoice → 400 without transport", async () => {
    mockGetPage.mockResolvedValueOnce({
      ...sentInvoice,
      frontmatter: { ...sentInvoice.frontmatter, items: [], total: 0, subtotal: 0, tax: 0 },
    });
    mockLoadSettings.mockResolvedValueOnce({} as never);
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(mockSendEInvoice).not.toHaveBeenCalled();
  });

  test("a second submission with a reference → 409; explicit resend goes through", async () => {
    const withRef = {
      ...sentInvoice,
      frontmatter: {
        ...sentInvoice.frontmatter,
        e_invoice_reference: "ref-0",
        e_invoice_attempt: 1,
      },
    };
    mockGetPage.mockResolvedValueOnce(withRef);
    expect((await post(body)).status).toBe(409);
    expect(mockSendEInvoice).not.toHaveBeenCalled();
    mockGetPage.mockResolvedValueOnce(withRef);
    expect((await post({ ...body, resend: true })).status).toBe(200);
    expect(mockSendEInvoice).toHaveBeenCalledTimes(1);
  });

  test("two parallel sends of a draft → one transport", async () => {
    const draft = {
      ...storedInvoice,
      frontmatter: { ...storedInvoice.frontmatter, status: "draft" },
    };
    mockGetPage.mockResolvedValue(draft);
    const [a, b] = await Promise.all([post(body), post(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(mockSendEInvoice).toHaveBeenCalledTimes(1);
    mockGetPage.mockReset();
  });
});
