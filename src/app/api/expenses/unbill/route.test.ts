// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeArrayBrain } from "@/test/fake-array-brain";

type Fm = Record<string, unknown>;
const pages = new Map<string, Fm>();
let invoices: Array<{ slug: string; frontmatter: Fm }> = [];

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
  pages.clear();
  pages.set("cases/a", {
    expenses: [{ id: "exp-1", amount: 20, billed: true, invoice_number: "R-1" }],
  });
  invoices = [{ slug: "invoice/r1", frontmatter: { invoice_number: "R-1", status: "paid" } }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(invoices.map((p) => ({ ...p, title: p.slug }))))
  );
});

function call() {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/expenses/unbill", {
      method: "POST",
      body: JSON.stringify({ entry_ids: ["exp-1"], case_slug: "cases/a" }),
    })
  );
}

const expense = () => (pages.get("cases/a")!.expenses as Fm[])[0];

describe("POST /api/expenses/unbill (GELD-5)", () => {
  it("refuses to unbill an expense on a paid invoice", async () => {
    const res = await call();
    expect(res.status).toBe(409);
    expect(expense().billed).toBe(true);
  });

  it("unbills once the invoice is deleted (tombstoned)", async () => {
    invoices[0].frontmatter.status = "tombstoned";
    const res = await call();
    expect(res.status).toBe(200);
    expect(expense().billed).toBe(false);
  });
});
