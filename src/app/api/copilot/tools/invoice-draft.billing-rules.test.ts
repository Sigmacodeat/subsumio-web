import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fm = Record<string, unknown>;
const state = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  feeAgreements: [] as Array<Record<string, unknown>>,
  feeListFails: false,
  reserved: [] as Array<{ frontmatter: Record<string, unknown>; timeEntryIds: string[] }>,
}));

vi.mock("@/lib/billing/credits", () => ({
  CREDIT_COSTS: { think: 1, document_analysis: 2, subsumption: 3, deadline_detect: 1 },
  ensureTrialCredits: vi.fn(async () => true),
  checkCredits: vi.fn(async () => ({ ok: true, balance: 0, required: 1 })),
  insufficientCreditsResponse: () =>
    Response.json({ error: "insufficient_credits" }, { status: 402 }),
}));
vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  ENGINE_URL: "http://engine-test:3001",
  recordCreditConsumption: vi.fn(async () => {}),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async (_h: unknown, type: string) => {
    if (type === "fee_agreement") {
      if (state.feeListFails) throw new Error("engine down");
      return state.feeAgreements.map((fm) => ({ slug: "x", frontmatter: fm }));
    }
    return [];
  }),
}));
vi.mock("@/lib/time-tracking", () => ({
  listAllTimeEntries: vi.fn(async () => [
    { id: "t1", case_slug: "cases/a", description: "Telefonat", minutes: 7, date: "2026-09-01" },
    { id: "t2", case_slug: "cases/a", description: "Brief", minutes: 20, date: "2026-09-02" },
  ]),
}));
vi.mock("@/lib/invoice-numbering", () => ({
  allocateInvoiceNumber: vi.fn(async () => "R-2026-0001"),
  reserveInvoiceNumber: vi.fn(async () => "R-2026-0001"),
  highestInvoiceNumber: () => 0,
}));
vi.mock("@/lib/invoice-billing-lock", () => ({
  createInvoiceReservingEntries: vi.fn(
    async (
      _h: unknown,
      _b: unknown,
      input: { frontmatter: Record<string, unknown>; timeEntryIds: string[] }
    ) => {
      state.reserved.push(input);
      return { kind: "created", page: {}, claimed: { time: input.timeEntryIds, expenses: [] } };
    }
  ),
}));
vi.mock("@/lib/server-brain", () => ({ createServerBrainClient: () => ({}) }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a" },
        user: { id: "u-lawyer", role: "lawyer", email: "l@x.at", brainId: "firm-a" },
        billing: { ownerId: "u-owner", ownerType: "user" },
      };
      return handler(ctx, opts.body!.parse(await req.json()));
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/copilot/tools", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

async function draft() {
  const params = { case_slug: "cases/a" };
  const prepared = await (await call({ tool: "invoice_draft", params, mode: "prepare" })).json();
  const res = await call({
    tool: "invoice_draft",
    params,
    confirmation: prepared.data.confirmation,
  });
  return res.json();
}

beforeEach(() => {
  state.settings = null;
  state.feeAgreements = [];
  state.feeListFails = false;
  state.reserved = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("legal%2Fsettings%2Fkanzlei")) {
        return state.settings
          ? Response.json({ frontmatter: state.settings })
          : new Response("{}", { status: 404 });
      }
      if (url.includes("/api/pages/")) {
        return Response.json({
          slug: "cases/a",
          title: "Akte A",
          content: "",
          frontmatter: { type: "legal_case", case_number: "AZ-1", legal_area: "arbeitsrecht" },
        });
      }
      return Response.json({ ok: true });
    })
  );
});

describe("copilot invoice_draft — Abrechnungsregeln (OPS-16)", () => {
  it("switch off: positions exactly as before (no rounding, firm rate)", async () => {
    state.settings = {
      stundensatz: "200",
      abrechnungstakt: "15",
      rechtsgebietSaetze: { arbeitsrecht: 230 },
    };
    const out = await draft();
    expect(out.success).toBe(true);
    expect(state.reserved[0].frontmatter.items).toEqual([
      { description: "Telefonat", date: "2026-09-01", hours: 0.12, rate: 200, amount: 23.33 },
      { description: "Brief", date: "2026-09-02", hours: 0.33, rate: 200, amount: 66.67 },
    ]);
  });

  it("switch on: same rounding and rate choice as the dialog", async () => {
    state.settings = {
      billingRulesEnabled: true,
      stundensatz: "200",
      abrechnungstakt: "15",
      rechtsgebietSaetze: { arbeitsrecht: 230 },
    };
    state.feeAgreements = [{ case_slug: "cases/a", hourly_rate: 260 }];
    const out = await draft();
    expect(out.success).toBe(true);
    const items = state.reserved[0].frontmatter.items as Fm[];
    expect(items.map((i) => [i.recorded_minutes, i.billed_minutes, i.rate, i.rate_source])).toEqual(
      [
        [7, 15, 260, "fee_agreement"],
        [20, 30, 260, "fee_agreement"],
      ]
    );
    expect(items.map((i) => i.amount)).toEqual([65, 130]);
    expect(state.reserved[0].timeEntryIds).toEqual(["t1", "t2"]);
  });

  it("switch on: unreadable fee agreements → no draft", async () => {
    state.settings = { billingRulesEnabled: true, stundensatz: "200", abrechnungstakt: "15" };
    state.feeListFails = true;
    const out = await draft();
    expect(out.success).toBe(false);
    expect(out.error).toBe("fee_agreements_unavailable");
    expect(state.reserved).toHaveLength(0);
  });

  it("switch on without any usable rate → no draft, no invented rate", async () => {
    state.settings = {
      billingRulesEnabled: true,
      stundensatz: "",
      abrechnungstakt: "15",
      rechtsgebietSaetze: {},
    };
    const out = await draft();
    expect(out.success).toBe(false);
    expect(out.error).toBe("no_hourly_rate");
    expect(state.reserved).toHaveLength(0);
  });
});
