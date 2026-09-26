// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const stored = {
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
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({ getPage: async () => stored }),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: async () => ({
    kanzleiName: "Kanzlei Test",
    ustId: "ATU12345678",
    country: "AT",
    zip: "1010",
    city: "Wien",
  }),
}));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { body: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, body: unknown, q: unknown, r: Request) => Promise<Response>
      ) =>
      async (req: Request) =>
        handler(
          { headers: {}, brainId: "b", user: { id: "u" } },
          opts.body.parse(await req.json()),
          {},
          req
        ),
  };
});

import { POST } from "./route";

describe("POST /api/e-invoice/generate", () => {
  it("builds the file from the stored invoice; a different IBAN in the body is ignored", async () => {
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(
      new Request("http://x/api/e-invoice/generate", {
        method: "POST",
        body: JSON.stringify({
          format: "xrechnung",
          invoiceSlug: stored.slug,
          invoice: { invoice_number: "FAKE", bank: { iban: "AT999999999999999999" } },
          settings: { kanzleiName: "Angreifer OG" },
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { xml: string };
    expect(json.xml).toContain("AT611904300234573201");
    expect(json.xml).toContain("R-2026-0001");
    expect(json.xml).not.toContain("AT999999999999999999");
    expect(json.xml).not.toContain("Angreifer");
  });
});
