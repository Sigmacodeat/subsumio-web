// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeArrayBrain } from "@/test/fake-array-brain";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  bindingInvoice,
  createInvoiceReservingEntries,
  findUnbillBlockers,
  releaseInvoiceEntries,
  releaseWorkOfInvoice,
  type InvoiceBillingClient,
} from "./invoice-billing-lock";
import type { ListedPage } from "@/lib/engine-pages";

type Fm = Record<string, unknown>;

let pages: Map<string, Fm>;
let brain: InvoiceBillingClient;
let created: Array<Record<string, unknown>>;

const createPage = vi.fn(async (_h: Record<string, string>, payload: Record<string, unknown>) => {
  created.push(payload);
  return Response.json({ slug: payload.slug });
});

beforeEach(() => {
  created = [];
  createPage.mockClear();
  pages = new Map<string, Fm>([
    [
      "cases/a",
      {
        time_entries: [
          { id: "te-1", minutes: 60, billed: false },
          { id: "te-2", minutes: 30, billed: false },
        ],
        expenses: [{ id: "exp-1", amount: 20, billed: false }],
      },
    ],
  ]);
  brain = createFakeArrayBrain(pages);
});

function input(number: string, slug = `invoice/${number}`) {
  return {
    slug,
    title: `Rechnung ${number}`,
    frontmatter: { invoice_number: number, status: "draft", case_slugs: ["cases/a"] },
    caseSlug: "cases/a",
    invoiceNumber: number,
    timeEntryIds: ["te-1", "te-2"],
    expenseIds: ["exp-1"],
  };
}

const timeEntries = () => pages.get("cases/a")!.time_entries as Fm[];
const expenses = () => pages.get("cases/a")!.expenses as Fm[];

describe("createInvoiceReservingEntries (GELD-4)", () => {
  it("reserves the work before the invoice exists", async () => {
    const out = await createInvoiceReservingEntries({}, brain, input("R-1"), createPage);
    expect(out.kind).toBe("created");
    expect(timeEntries().every((e) => e.billed === true && e.invoice_number === "R-1")).toBe(true);
    expect(expenses()[0].invoice_number).toBe("R-1");
    expect(created).toHaveLength(1);
  });

  it("two parallel invoices over the same work: exactly one is created", async () => {
    const [a, b] = await Promise.all([
      createInvoiceReservingEntries({}, brain, input("R-1"), createPage),
      createInvoiceReservingEntries({}, brain, input("R-2"), createPage),
    ]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["conflict", "created"]);
    expect(created).toHaveLength(1);
    const winner = String(created[0].slug).split("/")[1];
    // Every entry sits on the winning invoice only — the loser rolled back.
    expect(timeEntries().map((e) => e.invoice_number)).toEqual([winner, winner]);
    expect(expenses()[0].invoice_number).toBe(winner);
  });

  it("aborts and rolls back when one entry is already billed elsewhere", async () => {
    timeEntries()[1] = { id: "te-2", minutes: 30, billed: true, invoice_number: "R-0" };
    const out = await createInvoiceReservingEntries({}, brain, input("R-1"), createPage);
    expect(out.kind).toBe("conflict");
    if (out.kind === "conflict") expect(out.alreadyBilled.time).toEqual(["te-2"]);
    expect(created).toHaveLength(0);
    expect(timeEntries()[0].billed).toBe(false);
    expect(timeEntries()[0].invoice_number).toBeUndefined();
    expect(timeEntries()[1].invoice_number).toBe("R-0");
    expect(expenses()[0].billed).toBe(false);
  });

  it("never takes over work billed outside Subsumio (billed without number)", async () => {
    timeEntries()[0] = { id: "te-1", minutes: 60, billed: true };
    const out = await createInvoiceReservingEntries({}, brain, input("R-1"), createPage);
    expect(out.kind).toBe("conflict");
    expect(timeEntries()[0]).toEqual({ id: "te-1", minutes: 60, billed: true });
  });

  it("releases the reservation when the invoice page cannot be written", async () => {
    const failing = vi.fn(async () => Response.json({ error: "x" }, { status: 500 }));
    const out = await createInvoiceReservingEntries({}, brain, input("R-1"), failing);
    expect(out.kind).toBe("create_failed");
    expect(timeEntries().every((e) => e.billed === false)).toBe(true);
  });
});

describe("releaseInvoiceEntries / releaseWorkOfInvoice (GELD-9)", () => {
  it("frees exactly the work billed under that invoice", async () => {
    pages.set("cases/a", {
      time_entries: [
        { id: "te-1", billed: true, invoice_number: "R-1" },
        { id: "te-2", billed: true, invoice_number: "R-1" },
        { id: "te-3", billed: true, invoice_number: "R-7" },
      ],
      expenses: [{ id: "exp-1", billed: true, invoice_number: "R-1" }],
    });
    const released = await releaseWorkOfInvoice(
      {},
      "invoice/R-1",
      { invoice_number: "R-1", case_slugs: ["cases/a"] },
      "draft_deleted",
      brain
    );
    expect(released).toEqual({ time: 2, expenses: 1 });
    expect(timeEntries().map((e) => e.billed)).toEqual([false, false, true]);
    expect(timeEntries()[2].invoice_number).toBe("R-7");
    expect(expenses()[0].billed).toBe(false);
  });

  it("reports a failed release as null instead of throwing", async () => {
    const out = await releaseWorkOfInvoice(
      {},
      "invoice/R-1",
      { invoice_number: "R-1", case_slugs: ["cases/missing"] },
      "storno",
      brain
    );
    expect(out).toBeNull();
  });

  it("releases standalone time-entry pages billed under the invoice", async () => {
    pages.set("time-entries/t1", { type: "time_entry", billed: true, invoice_number: "R-1" });
    const r = await releaseInvoiceEntries(brain, {
      caseSlugs: [],
      invoiceNumber: "R-1",
      timeEntryIds: ["time-entries/t1"],
    });
    expect(r.time).toBe(1);
    expect(pages.get("time-entries/t1")!.billed).toBe(false);
  });
});

describe("findUnbillBlockers (GELD-5)", () => {
  const inv = (slug: string, fm: Fm): ListedPage => ({ slug, title: slug, frontmatter: fm });

  it("blocks work on a sent, not stornoed invoice", async () => {
    const list = async () => [inv("invoice/r1", { invoice_number: "R-1", status: "sent" })];
    const b = await findUnbillBlockers({}, [{ id: "te-1", invoice_number: "R-1" }], list);
    expect(b).toEqual([{ id: "te-1", invoice_number: "R-1", status: "sent" }]);
  });

  it("frees work of drafts, deleted, cancelled and stornoed invoices", () => {
    const all = [
      inv("invoice/d", { invoice_number: "R-D", status: "draft" }),
      inv("invoice/t", { invoice_number: "R-T", status: "tombstoned" }),
      inv("invoice/c", { invoice_number: "R-C", status: "cancelled" }),
      inv("invoice/s", { invoice_number: "R-S", status: "paid" }),
      inv("legal/invoices/storno-1", {
        invoice_number: "R-X",
        invoice_type: "storno",
        parent_invoice_id: "invoice/s",
        status: "draft",
      }),
    ];
    for (const n of ["R-D", "R-T", "R-C", "R-S", "R-unknown"]) {
      expect(bindingInvoice(n, all)).toBeNull();
    }
  });

  it("a deleted Storno-Note does not free the work", () => {
    const all = [
      inv("invoice/s", { invoice_number: "R-S", status: "sent" }),
      inv("legal/invoices/storno-1", {
        invoice_type: "storno",
        parent_invoice_id: "invoice/s",
        status: "tombstoned",
      }),
    ];
    expect(bindingInvoice("R-S", all)?.slug).toBe("invoice/s");
  });

  it("needs no listing for entries without an invoice number", async () => {
    const list = vi.fn(async () => []);
    expect(await findUnbillBlockers({}, [{ id: "te-1" }], list)).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it("propagates a failed listing (caller fails closed)", async () => {
    const list = async () => {
      throw new Error("down");
    };
    await expect(
      findUnbillBlockers({}, [{ id: "te-1", invoice_number: "R-1" }], list)
    ).rejects.toThrow();
  });
});
