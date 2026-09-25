// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { time: {}, brain: {}, expenses: {} } }));
vi.mock("@/lib/offline-store", () => ({ isOnline: () => true, enqueueMutation: vi.fn() }));

import { markInvoicedEntriesBilled, type MarkInvoicedEntriesDeps } from "./invoice-mark-billed";

function deps(overrides: Partial<MarkInvoicedEntriesDeps> = {}): MarkInvoicedEntriesDeps {
  return {
    isOnline: () => true,
    markBilled: vi.fn(async () => ({ updated: 1, not_found: [], invoice_number: "R-1" })),
    markExpensesBilled: vi.fn(async () => ({
      updated: 1,
      not_found: [],
      already_billed: [],
      invoice_number: "R-1",
    })),
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
    expect(d.markExpensesBilled).not.toHaveBeenCalled();
  });

  it("sends expenses to /api/expenses/mark-billed instead of patching the matter", async () => {
    const d = deps();
    const failed = await markInvoicedEntriesBilled(
      { ...base, timeEntryIds: [], expenseIds: ["e1"] },
      d
    );
    expect(failed).toBe(false);
    // The server route owns the billed guard + already_billed reporting +
    // audit trail — the client never writes a local expenses snapshot.
    expect(d.markExpensesBilled).toHaveBeenCalledWith({
      entry_ids: ["e1"],
      invoice_number: "R-1",
      case_slug: "cases/a",
    });
    expect(d.enqueueMutation).not.toHaveBeenCalled();
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
    expect(d.markExpensesBilled).toHaveBeenCalledTimes(1);
  });

  it("a 200 with already_billed is a failure: an expense the server kept on another invoice", async () => {
    const d = deps({
      markExpensesBilled: vi.fn(async () => ({
        updated: 1,
        not_found: [],
        already_billed: ["e1"],
        invoice_number: "R-1",
      })),
    });
    await expect(
      markInvoicedEntriesBilled({ ...base, timeEntryIds: [], expenseIds: ["e1", "e2"] }, d)
    ).resolves.toBe(true);
  });

  it("a 200 with not_found (time or expense) is a failure, a clean 200 is not", async () => {
    const timeMissing = deps({
      markBilled: vi.fn(async () => ({ updated: 0, not_found: ["t1"], invoice_number: "R-1" })),
    });
    await expect(
      markInvoicedEntriesBilled({ ...base, timeEntryIds: ["t1"], expenseIds: [] }, timeMissing)
    ).resolves.toBe(true);

    const clean = deps();
    await expect(
      markInvoicedEntriesBilled({ ...base, timeEntryIds: ["t1"], expenseIds: ["e1"] }, clean)
    ).resolves.toBe(false);
  });

  it("reports a failure when expense mark-billed rejects (e.g. all ids unknown → 404)", async () => {
    const d = deps({
      markExpensesBilled: vi.fn(async () => {
        throw new Error("HTTP 404 expense_not_found");
      }),
    });
    await expect(
      markInvoicedEntriesBilled({ ...base, timeEntryIds: [], expenseIds: ["e1"] }, d)
    ).resolves.toBe(true);
  });

  it("offline, queues only the lists the invoice touched", async () => {
    const d = deps({ isOnline: () => false });
    await markInvoicedEntriesBilled({ ...base, timeEntryIds: ["t1"], expenseIds: [] }, d);
    expect(d.enqueueMutation).toHaveBeenCalledWith({
      type: "updatePage",
      payload: { slug: "cases/a", frontmatter: { time_entries: [{ id: "t1" }] } },
    });
    expect(d.markBilled).not.toHaveBeenCalled();
    expect(d.markExpensesBilled).not.toHaveBeenCalled();
  });
});
