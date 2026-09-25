// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeArrayBrain } from "@/test/fake-array-brain";

type Fm = Record<string, unknown>;
const pages = new Map<string, Fm>();
const invoicePages = new Map<string, Fm>();
let listFails = false;
/** An invoice another request writes between the existence check and this write. */
let takenAtWrite: string | null = null;
const writes: Array<Record<string, unknown>> = [];

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

beforeEach(() => {
  listFails = false;
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
      if (u.pathname === "/api/pages" && u.searchParams.get("type") === "invoice") {
        if (listFails) return new Response("{}", { status: 500 });
        return Response.json(
          [...invoicePages].map(([slug, frontmatter]) => ({ slug, title: slug, frontmatter }))
        );
      }
      const slug = decodeURIComponent(u.pathname.replace(/^\/api\/pages\//, ""));
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
      total: 100,
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
