// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidIban } from "@/lib/iban";

type Fm = Record<string, unknown>;
let invoice: Fm | null;
let openItem: Fm | undefined;
const writes: Array<{ frontmatter: Fm }> = [];

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/page-write-guards", () => ({
  GUARD_READ_FAILED: { status: 503, error: "guard_unavailable", message: "x" },
  rejectionResponse: (r: { status: number; error: string }) =>
    Response.json({ error: r.error }, { status: r.status }),
  readCurrentPage: async () =>
    invoice
      ? { kind: "found", page: { slug: "inv/1", frontmatter: invoice } }
      : { kind: "missing" },
}));
vi.mock("@/lib/open-items", () => ({ findOpenItemForInvoice: async () => openItem }));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: async () => ({
    kanzleiName: "Kanzlei X",
    iban: "AT61 1904 3002 3457 3201",
    bic: "BKAUATWW",
  }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_o: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler({ headers: {}, brainId: "b", user: { id: "u1" } }, await req.json()),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";

const call = (body: Fm) =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/fibu/payment-links", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  writes.length = 0;
  invoice = { status: "sent", invoice_number: "R-2026-0001", client: "Mandant", total: 1200 };
  openItem = { status: "reminded", open_amount: 1205, dunning_fee: 5 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      writes.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    })
  );
});

describe("POST /api/fibu/payment-links (GELD-23)", () => {
  it("IBAN with a wrong check digit → 400", async () => {
    const res = await call({ invoice_id: "inv/1", iban: "AT621904300234573201" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("iban_invalid");
    expect(writes).toHaveLength(0);
  });

  it("amount different from the open item → 422", async () => {
    const res = await call({ invoice_id: "inv/1", amount: 1200 });
    expect(res.status).toBe(422);
  });

  it("without amount/IBAN: open amount of the item, firm IBAN and BIC", async () => {
    const res = await call({ invoice_id: "inv/1" });
    expect(res.status).toBe(200);
    const link = (await res.json()).data.payment_link;
    expect(link.amount).toBe(1205);
    expect(link.iban).toBe("AT611904300234573201");
    expect(link.epc_qr_payload.split("\n")[4]).toBe("BKAUATWW");
    expect(link.epc_qr_payload).toContain("EUR1205.00");
  });

  it("a paid invoice gets no payment link", async () => {
    invoice = { ...invoice!, status: "paid" };
    expect((await call({ invoice_id: "inv/1" })).status).toBe(409);
  });
});

describe("isValidIban", () => {
  it("mod-97", () => {
    expect(isValidIban("AT61 1904 3002 3457 3201")).toBe(true);
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("AT621904300234573201")).toBe(false);
    expect(isValidIban("AT6119043002345732")).toBe(false);
  });
});
