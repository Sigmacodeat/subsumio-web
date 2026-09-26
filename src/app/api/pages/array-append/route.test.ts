// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler({ headers: {}, brainId: "b", user: { id: "u1" } }, await req.json()),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { POST } from "./route";

let stored: unknown;
let appended = 0;

beforeEach(() => {
  appended = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") return Response.json(stored);
      appended++;
      return Response.json({ appended: 1, items: [] });
    })
  );
});

function call(body: Record<string, unknown>) {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/pages/array-append", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

const sent = { slug: "legal/invoices/r-1", type: "invoice", frontmatter: { status: "sent" } };

describe("/api/pages/array-append billing guards", () => {
  it("refuses new positions on a sent invoice", async () => {
    stored = sent;
    const res = await call({
      slug: "legal/invoices/r-1",
      field: "items",
      items: [{ description: "Nachtrag", amount: 50 }],
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_finalized");
    expect(appended).toBe(0);
  });

  it("still records a payment on a sent invoice", async () => {
    stored = sent;
    const res = await call({
      slug: "legal/invoices/r-1",
      field: "payments",
      items: [{ amount: 50, date: "2026-09-25" }],
    });
    expect(res.status).toBe(200);
    expect(appended).toBe(1);
  });

  it("refuses a new time entry that claims an invoice number", async () => {
    stored = { slug: "cases/a", type: "legal_case", frontmatter: {} };
    const res = await call({
      slug: "cases/a",
      field: "time_entries",
      items: [{ id: "te-9", minutes: 10, billed: true, invoice_number: "R-1" }],
    });
    expect(res.status).toBe(409);
    expect(appended).toBe(0);
  });
});
