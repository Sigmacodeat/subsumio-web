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

vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({ getPage: (...a: unknown[]) => mockGetPage(...a) }),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: () => mockLoadSettings(),
}));
vi.mock("@/lib/e-invoice/transport", () => ({
  sendEInvoice: (c?: string, x?: string, o?: unknown) => mockSendEInvoice(c, x, o),
  pollEInvoiceStatus: vi.fn(async () => ({ status: "delivered" })),
  transportAvailability: vi.fn(() => ({ peppol: true })),
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
