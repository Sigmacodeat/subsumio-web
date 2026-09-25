// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fm = Record<string, unknown>;
const pages = new Map<string, Fm>();
const engineWrites: Array<{ slug: string; frontmatter: Fm; merge?: boolean }> = [];
const mails: Array<{ to: string; subject: string; html: string }> = [];

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async (_h: unknown, type: string) =>
    [...pages]
      .filter(([, fm]) => fm.__type === type)
      .map(([slug, frontmatter]) => ({ slug, frontmatter })),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: async () => ({ kanzleiName: "Kanzlei X", anwaltName: "Dr. A" }),
}));
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    getPage: async (slug: string) => {
      const fm = pages.get(slug);
      if (!fm) throw new Error("404");
      return { slug, frontmatter: fm };
    },
    updatePage: async (p: { slug: string; frontmatter: Fm }) => {
      engineWrites.push({ ...p, merge: true });
      pages.set(p.slug, { ...(pages.get(p.slug) ?? {}), ...p.frontmatter });
      return { slug: p.slug };
    },
  }),
}));
vi.mock("@/lib/firm-mail", () => ({
  sendFirmMail: async (_s: unknown, m: { to: string; subject: string; html: string }) => {
    mails.push(m);
    return { sent: true, via: "smtp", trackingId: "t-1", id: "m-1" };
  },
}));
vi.mock("@/lib/email/tracking", () => ({
  generateTrackingId: () => "t-1",
  logTrackingEvent: vi.fn(),
}));
vi.mock("@/lib/keyed-lock", () => ({
  withKeyedLock: (_k: string, fn: () => Promise<unknown>) => fn(),
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
import { reminderMailHtml } from "@/lib/invoice-outbound.server";

const INV = "legal/invoices/r-1";
const OP = "legal/open-items/opos-legal-invoices-r-1";

beforeEach(() => {
  pages.clear();
  engineWrites.length = 0;
  mails.length = 0;
  pages.set(INV, {
    status: "sent",
    invoice_number: "R-2026-0001",
    client: "Mandant GmbH",
    client_slug: "contacts/m",
    total: 1234.5,
    case_slugs: ["cases/a"],
  });
  pages.set("contacts/m", { email: "m@example.at" });
  pages.set(OP, {
    __type: "open_item",
    id: "opos-legal-invoices-r-1",
    invoice_id: INV,
    invoice_number: "R-2026-0001",
    client_name: "Mandant GmbH",
    amount: 1234.5,
    paid_amount: 0,
    open_amount: 1234.5,
    due_date: "2026-01-01",
    dunning_level: 0,
    dunning_fee: 0,
    status: "open",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          slug: string;
          frontmatter: Fm;
          merge?: boolean;
        };
        engineWrites.push(body);
        pages.set(body.slug, {
          ...(body.merge ? (pages.get(body.slug) ?? {}) : {}),
          ...body.frontmatter,
        });
        return Response.json({ ok: true });
      }
      return new Response("{}", { status: 404 });
    })
  );
});

const remind = () =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/invoices/remind", {
      method: "POST",
      body: JSON.stringify({ invoiceSlug: INV }),
    })
  );

describe("POST /api/invoices/remind (GELD-11 / GELD-17 / GELD-21)", () => {
  it("second reminder: mail names the open amount incl. all fees, OP at level 2", async () => {
    expect((await remind()).status).toBe(200);
    const res = await remind();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feeTotal).toBe(10);
    expect(body.newTotal).toBe(1244.5);
    expect(mails[1].html).toContain("1.244,50");
    expect(mails[1].html).toContain("1.234,50");
    expect(mails[1].html).not.toContain("1244.50");
    const op = pages.get(OP)!;
    expect(op.dunning_level).toBe(2);
    expect(op.dunning_fee).toBe(10);
    expect(op.open_amount).toBe(1244.5);
  });

  it("writes a Postausgangsbuch entry with the invoice number and the matter", async () => {
    await remind();
    const outbound = engineWrites.find((w) => w.slug.startsWith("legal/outbound-register/"));
    expect(String(outbound?.frontmatter.subject)).toContain("R-2026-0001");
    expect(outbound?.frontmatter.case_slug).toBe("cases/a");
  });

  it("an invoice whose open item is already paid is not reminded (409)", async () => {
    pages.set(OP, { ...pages.get(OP)!, status: "paid", open_amount: 0 });
    const res = await remind();
    expect(res.status).toBe(409);
    expect(mails).toHaveLength(0);
  });

  it("writes only the reminder fields back onto the invoice (merge)", async () => {
    await remind();
    const inv = engineWrites.find((w) => w.slug === INV)!;
    expect(inv.merge).toBe(true);
    expect(Object.keys(inv.frontmatter).sort()).toEqual([
      "reminder_count",
      "reminder_fee",
      "reminder_sent_at",
      "status",
    ]);
  });

  it("mail snapshot uses de-AT amounts", () => {
    const html = reminderMailHtml({
      label: "Erste Mahnung",
      client: "M",
      invoiceNumber: "R-1",
      invoiceTotal: 1234.5,
      paidSoFar: 0,
      feeAdded: 5,
      feeTotal: 5,
      openAmount: 1239.5,
      signature: "Dr. A",
    });
    expect(html).toContain("1.234,50");
    expect(html).toContain("1.239,50");
  });
});
