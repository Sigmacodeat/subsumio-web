// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeArrayBrain } from "@/test/fake-array-brain";

type Fm = Record<string, unknown>;
const pages = new Map<string, Fm>();
const invoicePages = new Map<string, Fm>();
let listFails = false;
/** Stored Kanzlei settings (null = never saved → 404 → defaults). */
let settingsFm: Fm | null = null;
let settingsFails = false;
/** An invoice another request writes between the existence check and this write. */
let takenAtWrite: string | null = null;
const writes: Array<Record<string, unknown>> = [];
/** Stored fee agreements (engine list of type fee_agreement). */
let feeAgreements: Fm[] = [];

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => createFakeArrayBrain(pages),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler({ headers: {}, brainId: "b", user: { id: "u1" } }, await req.json()),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta: unknown, status = 200) => Response.json({ data }, { status }),
  recordQuota: vi.fn(),
}));

import { POST } from "./route";
import { roundHours, timeLineAmount } from "@/lib/billing-rules";
import { computeInvoiceTotals } from "@/lib/invoice-totals";

beforeEach(() => {
  listFails = false;
  // Firm rate 200 €/h; the billing rules stay off unless a test switches them on.
  settingsFm = { stundensatz: "200" };
  settingsFails = false;
  feeAgreements = [];
  takenAtWrite = null;
  writes.length = 0;
  pages.clear();
  invoicePages.clear();
  pages.set("cases/a", {
    time_entries: [
      { id: "te-1", minutes: 60, billed: false },
      { id: "te-2", minutes: 30, billed: false },
    ],
    expenses: [],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (init?.method === "POST" && u.pathname === "/api/pages") {
        const body = JSON.parse(String(init.body)) as {
          slug: string;
          frontmatter: Fm;
          if_absent?: boolean;
        };
        writes.push(body);
        if (takenAtWrite === body.slug) invoicePages.set(body.slug, { invoice_number: "other" });
        if (body.if_absent && invoicePages.has(body.slug)) {
          return Response.json({ error: "page_exists", message: "exists" }, { status: 409 });
        }
        invoicePages.set(body.slug, body.frontmatter);
        return Response.json({ slug: body.slug });
      }
      if (u.pathname === "/api/pages" && u.searchParams.get("type") === "fee_agreement") {
        return Response.json(
          feeAgreements.map((frontmatter, i) => ({ slug: `fee/${i}`, title: "HV", frontmatter }))
        );
      }
      if (u.pathname === "/api/pages" && u.searchParams.get("type") === "invoice") {
        if (listFails) return new Response("{}", { status: 500 });
        // Engine-side frontmatter filter (fm.<key>), as the real engine applies it.
        const byNumber = u.searchParams.get("fm.invoice_number");
        return Response.json(
          [...invoicePages]
            .filter(([, fm]) => byNumber === null || String(fm.invoice_number) === byNumber)
            .map(([slug, frontmatter]) => ({ slug, title: slug, frontmatter }))
        );
      }
      const slug = decodeURIComponent(u.pathname.replace(/^\/api\/pages\//, ""));
      if (slug === "legal/settings/kanzlei") {
        if (settingsFails) return new Response("{}", { status: 500 });
        return settingsFm
          ? Response.json({ slug, type: "kanzlei_settings", frontmatter: settingsFm })
          : new Response("{}", { status: 404 });
      }
      const fm = invoicePages.get(slug);
      return fm
        ? Response.json({ slug, type: "invoice", frontmatter: fm })
        : new Response("{}", { status: 404 });
    })
  );
});

function payload(number: string) {
  return {
    slug: `invoice/${number}`,
    title: `Rechnung ${number}`,
    frontmatter: {
      invoice_number: number,
      status: "draft",
      case_slugs: ["cases/a"],
      time_entry_ids: ["te-1", "te-2"],
      expense_entry_ids: [],
      // One position per billed time entry (te-1 = 60 min, te-2 = 30 min) at
      // the firm rate of 200 €/h.
      items: [
        {
          description: "Beratung",
          date: "2026-09-01",
          hours: 1,
          rate: 200,
          amount: 200,
          time_entry_id: "te-1",
        },
        {
          description: "Telefonat",
          date: "2026-09-01",
          hours: 0.5,
          rate: 200,
          amount: 100,
          time_entry_id: "te-2",
        },
      ],
      vat_rate: 0.2,
      subtotal: 300,
      tax: 60,
      total: 360,
    },
  };
}

function call(body: unknown) {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/invoices", { method: "POST", body: JSON.stringify(body) })
  );
}

const entries = () => pages.get("cases/a")!.time_entries as Fm[];

describe("POST /api/invoices (GELD-4)", () => {
  it("creates the draft and bills its work in one step", async () => {
    const res = await call(payload("2026-001"));
    expect(res.status).toBe(201);
    expect(invoicePages.has("invoice/2026-001")).toBe(true);
    expect(entries().every((e) => e.invoice_number === "2026-001")).toBe(true);
  });

  it("two parallel creates over the same entries: one invoice, the other gets 409", async () => {
    const [a, b] = await Promise.all([call(payload("2026-001")), call(payload("2026-002"))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect((await loser.json()).error).toBe("entries_already_billed");
    expect(invoicePages.size).toBe(1);
    const [winnerSlug] = [...invoicePages.keys()];
    const winner = String(invoicePages.get(winnerSlug)!.invoice_number);
    expect(entries().map((e) => e.invoice_number)).toEqual([winner, winner]);
  });

  it("refuses an invoice number that is already taken", async () => {
    invoicePages.set("invoice/old", { invoice_number: "2026-001", status: "sent" });
    const res = await call(payload("2026-001"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_number_taken");
    expect(entries().every((e) => e.billed === false)).toBe(true);
  });

  it("refuses the number of an old invoice far outside the newest 5,000 (R11-3)", async () => {
    for (let i = 0; i < 6000; i++) {
      invoicePages.set(`invoice/newer-${i}`, { invoice_number: `N-${i}`, status: "sent" });
    }
    invoicePages.set("invoice/oldest", { invoice_number: "2026-001", status: "sent" });
    const listCalls: string[] = [];
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (new URL(url).searchParams.get("type") === "invoice") listCalls.push(url);
        return inner(url, init);
      })
    );
    const res = await call(payload("2026-001"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_number_taken");
    // One targeted lookup, not a scan of the firm's invoices.
    expect(listCalls).toHaveLength(1);
    expect(new URL(listCalls[0]).searchParams.get("fm.invoice_number")).toBe("2026-001");
  });

  it("writes the invoice page create-only", async () => {
    await call(payload("2026-001"));
    expect(writes[0]).toMatchObject({ slug: "invoice/2026-001", if_absent: true });
    expect(writes[0].merge).toBeUndefined();
  });

  it("an invoice created at the same slug in the meantime is not replaced: 409 invoice_exists", async () => {
    takenAtWrite = "invoice/2026-001";
    const res = await call(payload("2026-001"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_exists");
    expect(invoicePages.get("invoice/2026-001")).toEqual({ invoice_number: "other" });
    // The work reserved for the refused invoice is released again.
    expect(entries().every((e) => e.billed === false)).toBe(true);
  });

  it("fails closed when the invoice list cannot be read", async () => {
    listFails = true;
    const res = await call(payload("2026-001"));
    expect(res.status).toBe(503);
    expect(entries().every((e) => e.billed === false)).toBe(true);
  });
});

describe("POST /api/invoices — sums are checked by the server (GELD-2/GELD-3)", () => {
  it("refuses a total that does not follow from the positions: 422, nothing reserved", async () => {
    const body = payload("2026-001");
    body.frontmatter.total = 999;
    const res = await call(body);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("invoice_totals_mismatch");
    expect(invoicePages.size).toBe(0);
    expect(entries().every((e) => e.billed === false)).toBe(true);
  });

  it("taxes each expense at its own rate and stamps the per-rate breakdown", async () => {
    const body = payload("2026-001") as { frontmatter: Record<string, unknown> };
    Object.assign(body.frontmatter, {
      time_entry_ids: [],
      items: [{ description: "Honorar", date: "2026-09-01", hours: 0, rate: 0, amount: 1000 }],
      expenses: [{ description: "Gerichtsgebühr", date: "2026-09-01", amount: 100, vat_rate: 0 }],
      subtotal: 1000,
      expense_total: 100,
      tax: 200,
      total: 1300,
    });
    const res = await call(body);
    expect(res.status).toBe(201);
    expect(invoicePages.get("invoice/2026-001")!.tax_breakdown).toEqual([
      { rate: 0.2, net: 1000, tax: 200 },
      { rate: 0, net: 100, tax: 0 },
    ]);
  });

  it("tax on the court fee as well (the old flat rule) is refused", async () => {
    const body = payload("2026-001") as { frontmatter: Record<string, unknown> };
    Object.assign(body.frontmatter, {
      time_entry_ids: [],
      items: [{ description: "Honorar", date: "2026-09-01", hours: 0, rate: 0, amount: 1000 }],
      expenses: [{ description: "Gerichtsgebühr", date: "2026-09-01", amount: 100, vat_rate: 0 }],
      subtotal: 1000,
      expense_total: 100,
      tax: 220,
      total: 1320,
    });
    const res = await call(body);
    expect(res.status).toBe(422);
  });

  it("reverse charge needs the client's VAT ID", async () => {
    const body = payload("2026-001") as { frontmatter: Record<string, unknown> };
    Object.assign(body.frontmatter, { reverse_charge: true, tax: 0, total: 300 });
    expect((await call(body)).status).toBe(422);
    Object.assign(body.frontmatter, { client_vat_id: "DE123456789" });
    expect((await call(body)).status).toBe(201);
  });
});

describe("POST /api/invoices — Abrechnungsregeln der Kanzlei (OPS-16)", () => {
  // te-1 = 60 min, te-2 = 30 min (see beforeEach); rate 200 €/h.
  function ruledPayload(billed: [number, number]) {
    const rate = 200;
    const recorded = [60, 30];
    const items = recorded.map((rec, i) => {
      const b = billed[i];
      return {
        description: `Leistung ${i + 1}`,
        date: "2026-09-01",
        hours: roundHours(b / 60),
        rate,
        amount: timeLineAmount(b, rate),
        recorded_minutes: rec,
        billed_minutes: b,
        rate_source: "firm_default",
      };
    });
    const totals = computeInvoiceTotals({ items, vatRate: 0.2 });
    const body = payload("2026-001") as { frontmatter: Record<string, unknown> };
    Object.assign(body.frontmatter, {
      items,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    });
    return body;
  }

  it("rules off (default): an invoice exactly as before is accepted, even with a stored increment", async () => {
    settingsFm = { abrechnungstakt: "45", stundensatz: "200" };
    const res = await call(payload("2026-001"));
    expect(res.status).toBe(201);
  });

  it("rules off: positions that bill rounded-up minutes are refused", async () => {
    settingsFm = { abrechnungstakt: "45" };
    const res = await call(ruledPayload([90, 45]));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("invoice_billing_mismatch");
    expect(invoicePages.size).toBe(0);
  });

  it("rules on: positions rounded to the increment are accepted and keep both minutes", async () => {
    settingsFm = { billingRulesEnabled: true, abrechnungstakt: "45", stundensatz: "200" };
    const res = await call(ruledPayload([90, 45]));
    expect(res.status).toBe(201);
    const stored = invoicePages.get("invoice/2026-001")!.items as Array<Record<string, unknown>>;
    expect(stored.map((i) => [i.recorded_minutes, i.billed_minutes])).toEqual([
      [60, 90],
      [30, 45],
    ]);
    // The time entries themselves keep their recorded minutes.
    expect(entries().map((e) => e.minutes)).toEqual([60, 30]);
  });

  it("rules on: unrounded or legacy positions are refused, nothing reserved", async () => {
    settingsFm = { billingRulesEnabled: true, abrechnungstakt: "45", stundensatz: "200" };
    let res = await call(ruledPayload([60, 30]));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("invoice_billing_mismatch");
    res = await call(payload("2026-001"));
    expect(res.status).toBe(422);
    expect(invoicePages.size).toBe(0);
    expect(entries().every((e) => e.billed === false)).toBe(true);
  });

  it("fails closed when the Kanzlei settings cannot be read", async () => {
    settingsFails = true;
    const res = await call(payload("2026-001"));
    expect(res.status).toBe(503);
    expect(invoicePages.size).toBe(0);
  });
});

describe("POST /api/invoices — time positions follow the stored time entries (R6-10)", () => {
  /** One position for te-x, built like the dialog with the rules on. */
  function ruledBody(
    item: { recorded: number; billed: number; rate: number; source: string },
    ids = ["te-x"]
  ) {
    const items = [
      {
        description: "Beratung",
        date: "2026-09-01",
        hours: roundHours(item.billed / 60),
        rate: item.rate,
        amount: timeLineAmount(item.billed, item.rate),
        recorded_minutes: item.recorded,
        billed_minutes: item.billed,
        rate_source: item.source,
        time_entry_id: "te-x",
      },
    ];
    const totals = computeInvoiceTotals({ items, vatRate: 0.2 });
    const body = payload("2026-001") as { frontmatter: Record<string, unknown> };
    Object.assign(body.frontmatter, {
      time_entry_ids: ids,
      items,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    });
    return body;
  }

  beforeEach(() => {
    // te-x: 20 minutes recorded, no rate of its own; fee agreement 250 €/h.
    pages.set("cases/a", {
      legal_area: "Arbeitsrecht",
      time_entries: [{ id: "te-x", minutes: 20, billed: false, description: "Beratung" }],
      expenses: [],
    });
    feeAgreements = [{ case_slug: "cases/a", hourly_rate: 250 }];
    settingsFm = { billingRulesEnabled: true, abrechnungstakt: "10", stundensatz: "200" };
  });

  it("the correct position (20 min → 20 min at the fee-agreement rate) is accepted", async () => {
    const res = await call(
      ruledBody({ recorded: 20, billed: 20, rate: 250, source: "fee_agreement" })
    );
    expect(res.status).toBe(201);
  });

  it("more recorded minutes than the entry holds (self-consistent position) → 422, nothing reserved", async () => {
    const res = await call(
      ruledBody({ recorded: 120, billed: 120, rate: 250, source: "fee_agreement" })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invoice_billing_mismatch");
    expect(body.message).toContain("recorded_minutes");
    expect(invoicePages.size).toBe(0);
    expect((pages.get("cases/a")!.time_entries as Fm[])[0]!.billed).toBe(false);
  });

  it("a higher rate than the fee agreement → 422", async () => {
    const res = await call(
      ruledBody({ recorded: 20, billed: 20, rate: 400, source: "fee_agreement" })
    );
    expect(res.status).toBe(422);
    expect((await res.json()).message).toContain(".rate");
  });

  it("the firm rate claimed although a fee agreement applies → 422", async () => {
    const res = await call(
      ruledBody({ recorded: 20, billed: 20, rate: 200, source: "firm_default" })
    );
    expect(res.status).toBe(422);
  });

  it("a position bound to an entry the invoice does not bill → 422", async () => {
    pages.set("cases/a", {
      legal_area: "Arbeitsrecht",
      time_entries: [
        { id: "te-x", minutes: 20, billed: false },
        { id: "te-y", minutes: 20, billed: false },
      ],
      expenses: [],
    });
    const res = await call(
      ruledBody({ recorded: 20, billed: 20, rate: 250, source: "fee_agreement" }, ["te-y"])
    );
    expect(res.status).toBe(422);
  });

  it("rules off: minutes and rate come from the entry, not from the request", async () => {
    settingsFm = { stundensatz: "200" };
    const items = [
      {
        description: "Beratung",
        date: "2026-09-01",
        hours: 2,
        rate: 200,
        amount: 400,
        time_entry_id: "te-x",
      },
    ];
    const totals = computeInvoiceTotals({ items, vatRate: 0.2 });
    const body = payload("2026-001") as { frontmatter: Record<string, unknown> };
    Object.assign(body.frontmatter, {
      time_entry_ids: ["te-x"],
      items,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    });
    const res = await call(body);
    expect(res.status).toBe(422);
    expect((await res.json()).message).toContain(".hours");
  });

  it("a standalone entry of another matter is not accepted as this matter's work", async () => {
    settingsFm = { stundensatz: "200" };
    pages.set("cases/a", { time_entries: [], expenses: [] });
    // Standalone time entry page read by the route (another matter).
    invoicePages.set("time-entries/t1", {
      case_slug: "cases/other",
      minutes: 60,
      description: "Fremd",
    });
    const items = [
      {
        description: "Fremd",
        date: "2026-09-01",
        hours: 1,
        rate: 200,
        amount: 200,
        time_entry_id: "time-entries/t1",
      },
    ];
    const totals = computeInvoiceTotals({ items, vatRate: 0.2 });
    const body = payload("2026-001") as { frontmatter: Record<string, unknown> };
    Object.assign(body.frontmatter, {
      time_entry_ids: ["time-entries/t1"],
      items,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    });
    const res = await call(body);
    expect(res.status).toBe(422);
    expect((await res.json()).message).toContain("time_entry");
  });

  it("fails closed when the matter cannot be read", async () => {
    pages.delete("cases/a");
    const res = await call(
      ruledBody({ recorded: 20, billed: 20, rate: 250, source: "fee_agreement" })
    );
    expect(res.status).toBe(503);
    expect(invoicePages.size).toBe(0);
  });
});
