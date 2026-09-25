// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fm = Record<string, unknown>;
const stored = new Map<string, Fm>();
/** Simulates a payment booked while the run is going. */
let paidDuringRun: string | null = null;
let failWrites = false;
const writes: Array<{ slug: string; frontmatter: Fm; merge?: boolean }> = [];

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: () => ({}),
  enginePatchPage: async (_h: unknown, body: { slug: string; frontmatter: Fm }) => {
    writes.push({ ...body, merge: true });
    if (failWrites) return new Response("{}", { status: 500 });
    stored.set(body.slug, { ...(stored.get(body.slug) ?? {}), ...body.frontmatter });
    return Response.json({ ok: true });
  },
}));
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: async () => new Map([["brain-1", []]]),
  fetchAllPagesStrict: async () =>
    [...stored].map(([slug, frontmatter]) => ({ slug, frontmatter: { ...frontmatter } })),
}));
vi.mock("@/lib/page-write-guards", () => ({
  readCurrentPage: async (_url: string, _h: unknown, slug: string) => {
    if (paidDuringRun === slug) {
      stored.set(slug, { ...(stored.get(slug) ?? {}), status: "paid", open_amount: 0 });
    }
    const fm = stored.get(slug);
    return fm ? { kind: "found", page: { slug, frontmatter: fm } } : { kind: "missing" };
  },
}));
vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (fn: (req: Request) => Promise<Response>) => fn,
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { POST } from "./route";

const item = (id: string, over: Fm = {}): Fm => ({
  id,
  invoice_id: `legal/invoices/${id}`,
  invoice_number: `R-${id}`,
  client_name: "M",
  amount: 100,
  paid_amount: 0,
  open_amount: 100,
  due_date: "2020-01-01",
  dunning_level: 0,
  dunning_fee: 0,
  status: "open",
  ...over,
});

async function run() {
  const res = await (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/cron/dunning-run", { method: "POST" })
  );
  return res.json();
}

beforeEach(() => {
  stored.clear();
  writes.length = 0;
  paidDuringRun = null;
  failWrites = false;
});

describe("cron dunning-run (GELD-11 / GELD-12)", () => {
  it("only proposes the next level — no fee, no level change, merge write", async () => {
    stored.set("legal/open-items/a", item("a"));
    const body = await run();
    expect(body.dunningActions).toBe(1);
    const fm = stored.get("legal/open-items/a")!;
    expect(fm.dunning_suggested_level).toBe(3);
    expect(fm.dunning_level).toBe(0);
    expect(fm.dunning_fee).toBe(0);
    expect(fm.open_amount).toBe(100);
    expect(writes[0].merge).toBe(true);
    expect(Object.keys(writes[0].frontmatter).sort()).toEqual([
      "dunning_suggested_at",
      "dunning_suggested_level",
    ]);
  });

  it("an item paid while the run is going stays paid", async () => {
    stored.set("legal/open-items/a", item("a"));
    paidDuringRun = "legal/open-items/a";
    await run();
    expect(stored.get("legal/open-items/a")!.status).toBe("paid");
    expect(writes).toHaveLength(0);
  });

  it("engine errors are counted as failed, not swallowed", async () => {
    stored.set("legal/open-items/a", item("a"));
    failWrites = true;
    const body = await run();
    expect(body.failed).toBe(1);
    expect(body.dunningActions).toBe(0);
  });
});
