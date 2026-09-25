// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fm = Record<string, unknown>;
const pages = new Map<string, Fm>();
const updates: Array<{ slug: string; frontmatter: Fm }> = [];
const sendMail = vi.fn(async (..._a: unknown[]) => ({ messageId: "m" }));

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }) },
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: async () => ({
    smtpHost: "smtp.test",
    smtpUser: "u",
    smtpPassword: "p",
    kanzleiName: "Kanzlei X",
  }),
}));
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    getPage: async (slug: string) => ({ slug, frontmatter: pages.get(slug) ?? {} }),
    updatePage: async (p: { slug: string; frontmatter: Fm }) => {
      updates.push(p);
      return { slug: p.slug };
    },
  }),
}));
vi.mock("@/lib/email/tracking", () => ({
  generateTrackingId: () => "t",
  injectTracking: (h: string) => h,
  logTrackingEvent: vi.fn(),
}));
vi.mock("@/lib/open-items", () => ({ createOpenItemForInvoice: vi.fn(async () => ({})) }));
vi.mock("@/lib/invoice-outbound.server", () => ({
  recordInvoiceOutbound: vi.fn(async () => "out-1"),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_o: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler({ headers: {}, brainId: "b", user: { id: "u1", email: "a@k.at" } }, await req.json()),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { POST } from "./route";

const INV = "legal/invoices/r-1";
const draft: Fm = {
  status: "draft",
  invoice_number: "R-2026-0001",
  client: "Mandant GmbH",
  client_address: "Mandant GmbH\nRing 1\n1010 Wien",
  items: [{ description: "Beratung", date: "2026-09-01", hours: 2, rate: 500, amount: 1000 }],
  vat_rate: 0.2,
  subtotal: 1000,
  tax: 200,
  total: 1200,
};

const send = () =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/invoices/send", {
      method: "POST",
      body: JSON.stringify({ invoiceSlug: INV, toEmail: "m@example.at" }),
    })
  );

beforeEach(() => {
  pages.clear();
  updates.length = 0;
  sendMail.mockClear();
});

describe("POST /api/invoices/send (QA-14 / GELD-2)", () => {
  it("refuses to issue a draft without the client's address: 422, no mail", async () => {
    pages.set(INV, { ...draft, client_address: "" });
    const res = await send();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("client_address_missing");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("refuses a draft whose sums do not add up: 409, no mail", async () => {
    pages.set(INV, { ...draft, total: 999 });
    expect((await send()).status).toBe(409);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends a complete draft and writes back only the delivery fields", async () => {
    pages.set(INV, draft);
    expect((await send()).status).toBe(200);
    expect(sendMail).toHaveBeenCalledOnce();
    expect(updates[0].frontmatter.status).toBe("sent");
    expect(updates[0].frontmatter.total).toBeUndefined();
  });
});
