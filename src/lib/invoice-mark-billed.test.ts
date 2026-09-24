// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { time: {}, brain: {} } }));
vi.mock("@/lib/offline-store", () => ({ isOnline: () => true, enqueueMutation: vi.fn() }));

import { markInvoicedEntriesBilled, type MarkInvoicedEntriesDeps } from "./invoice-mark-billed";

function deps(overrides: Partial<MarkInvoicedEntriesDeps> = {}): MarkInvoicedEntriesDeps {
  return {
    isOnline: () => true,
    markBilled: vi.fn(async () => ({ updated: 1, not_found: [], invoice_number: "R-1" })),
    getPage: vi.fn(async () => ({ frontmatter: {} })),
    updatePage: vi.fn(async () => ({ slug: "cases/a", success: true })),
    enqueueMutation: vi.fn(async () => {}),
    ...overrides,
  };
}

const base = {
  caseSlug: "cases/a",
  invoiceNumber: "R-1",
  snapshot: {
    time_entries: [{ id: "t1" }],
    expenses: [{ id: "e1" }],
  },
};

describe("markInvoicedEntriesBilled", () => {
  it("never writes the stale time_entries snapshot back; mark-billed does it", async () => {
    const d = deps();
    const failed = await markInvoicedEntriesBilled(
      { ...base, timeEntryIds: ["t1"], expenseIds: [] },
      d
    );
    expect(failed).toBe(false);
    expect(d.markBilled).toHaveBeenCalledWith({
      entry_ids: ["t1"],
      invoice_number: "R-1",
      case_slug: "cases/a",
    });
    expect(d.updatePage).not.toHaveBeenCalled();
  });

  it("patches only expenses, on a fresh copy of the matter, keeping entries added meanwhile", async () => {
    const d = deps({
      getPage: vi.fn(async () => ({
        frontmatter: {
          time_entries: [{ id: "t-new" }],
          expenses: [
            { id: "e1", amount: 10 },
            { id: "e-new", amount: 5 },
          ],
        },
      })),
    });
    const failed = await markInvoicedEntriesBilled(
      { ...base, timeEntryIds: [], expenseIds: ["e1"] },
      d
    );
    expect(failed).toBe(false);
    expect(d.updatePage).toHaveBeenCalledWith({
      slug: "cases/a",
      frontmatter: {
        expenses: [
          { id: "e1", amount: 10, billed: true, invoice_number: "R-1" },
          { id: "e-new", amount: 5 },
        ],
      },
    });
  });

  it("reports a failure instead of throwing when mark-billed fails (no retry → no duplicate invoice)", async () => {
    const d = deps({
      markBilled: vi.fn(async () => {
        throw new Error("HTTP 500");
      }),
    });
    await expect(
      markInvoicedEntriesBilled({ ...base, timeEntryIds: ["t1"], expenseIds: ["e1"] }, d)
    ).resolves.toBe(true);
    // The expense step still ran.
    expect(d.updatePage).toHaveBeenCalledTimes(1);
  });

  it("offline, queues only the lists the invoice touched", async () => {
    const d = deps({ isOnline: () => false });
    await markInvoicedEntriesBilled({ ...base, timeEntryIds: ["t1"], expenseIds: [] }, d);
    expect(d.enqueueMutation).toHaveBeenCalledWith({
      type: "updatePage",
      payload: { slug: "cases/a", frontmatter: { time_entries: [{ id: "t1" }] } },
    });
    expect(d.markBilled).not.toHaveBeenCalled();
  });
});
