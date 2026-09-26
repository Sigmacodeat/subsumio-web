// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeArrayBrain } from "@/test/fake-array-brain";

type Fm = Record<string, unknown>;
const pages = new Map<string, Fm>();
let invoices: Array<{ slug: string; frontmatter: Fm }> = [];
let listFails = false;

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
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";

beforeEach(() => {
  listFails = false;
  pages.clear();
  pages.set("cases/a", {
    time_entries: [
      { id: "te-1", minutes: 60, billed: true, invoice_number: "R-1" },
      { id: "te-2", minutes: 15, billed: true },
    ],
  });
  invoices = [{ slug: "invoice/r1", frontmatter: { invoice_number: "R-1", status: "sent" } }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      listFails
        ? new Response("{}", { status: 500 })
        : Response.json(invoices.map((p) => ({ ...p, title: p.slug })))
    )
  );
});

function call(ids: string[]) {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/time/unbill", {
      method: "POST",
      body: JSON.stringify({ entry_ids: ids, case_slug: "cases/a" }),
    })
  );
}

const entry = (id: string) =>
  (pages.get("cases/a")!.time_entries as Fm[]).find((e) => e.id === id)!;

describe("POST /api/time/unbill (GELD-5)", () => {
  it("refuses to unbill work on a sent invoice", async () => {
    const res = await call(["te-1"]);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_finalized");
    expect(entry("te-1").billed).toBe(true);
  });

  it("unbills after the invoice was stornoed", async () => {
    invoices.push({
      slug: "legal/invoices/storno-r2",
      frontmatter: {
        invoice_number: "R-2",
        invoice_type: "storno",
        parent_invoice_id: "invoice/r1",
        status: "draft",
      },
    });
    const res = await call(["te-1"]);
    expect(res.status).toBe(200);
    expect(entry("te-1").billed).toBe(false);
    expect(entry("te-1").invoice_number).toBeUndefined();
  });

  it("unbills work of a draft invoice", async () => {
    invoices[0].frontmatter.status = "draft";
    expect((await call(["te-1"])).status).toBe(200);
    expect(entry("te-1").billed).toBe(false);
  });

  it("unbills entries billed without an invoice number (legacy import)", async () => {
    expect((await call(["te-2"])).status).toBe(200);
    expect(entry("te-2").billed).toBe(false);
  });

  it("fails closed when the invoices cannot be listed", async () => {
    listFails = true;
    expect((await call(["te-1"])).status).toBe(503);
    expect(entry("te-1").billed).toBe(true);
  });
});
