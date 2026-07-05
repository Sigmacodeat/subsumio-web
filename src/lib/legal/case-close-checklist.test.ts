// @vitest-environment node

import { describe, test, expect } from "vitest";
import { evaluateCaseCloseChecklist } from "../case-close-checklist";

describe("evaluateCaseCloseChecklist", () => {
  test("all checks pass when everything is resolved", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [{ billed: true, billable: true }],
      expenses: [{ billed: true, billable: true }],
      deadlines: [{ status: "done" }],
      documentRequests: [{ status: "fulfilled" }],
      invoices: [{ status: "paid" }],
    });

    expect(result.hasBlockers).toBe(false);
    expect(result.blockerCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.items.every((i) => i.passed)).toBe(true);
  });

  test("blocker: unbilled time entries", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [
        { billed: false, billable: true },
        { billed: true, billable: true },
      ],
      expenses: [],
      deadlines: [],
      documentRequests: [],
      invoices: [],
    });

    const item = result.items.find((i) => i.key === "unbilled_time");
    expect(item?.passed).toBe(false);
    expect(item?.severity).toBe("blocker");
    expect(item?.count).toBe(1);
    expect(result.hasBlockers).toBe(true);
  });

  test("blocker: unbilled expenses", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [],
      expenses: [
        { billed: false, billable: true },
        { billed: false, billable: true },
      ],
      deadlines: [],
      documentRequests: [],
      invoices: [],
    });

    const item = result.items.find((i) => i.key === "unbilled_expenses");
    expect(item?.passed).toBe(false);
    expect(item?.severity).toBe("blocker");
    expect(item?.count).toBe(2);
    expect(result.hasBlockers).toBe(true);
  });

  test("blocker: open deadlines", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [],
      expenses: [],
      deadlines: [
        { status: "pending" },
        { status: "warning" },
        { status: "critical" },
        { status: "done" },
      ],
      documentRequests: [],
      invoices: [],
    });

    const item = result.items.find((i) => i.key === "open_deadlines");
    expect(item?.passed).toBe(false);
    expect(item?.severity).toBe("blocker");
    expect(item?.count).toBe(3);
    expect(result.hasBlockers).toBe(true);
  });

  test("warning: open document requests", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [],
      expenses: [],
      deadlines: [],
      documentRequests: [{ status: "pending" }, { status: "fulfilled" }, { status: "expired" }],
      invoices: [],
    });

    const item = result.items.find((i) => i.key === "open_doc_requests");
    expect(item?.passed).toBe(false);
    expect(item?.severity).toBe("warning");
    expect(item?.count).toBe(1);
    expect(result.hasBlockers).toBe(false);
    expect(result.warningCount).toBe(1);
  });

  test("blocker: unpaid invoices", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [],
      expenses: [],
      deadlines: [],
      documentRequests: [],
      invoices: [
        { status: "sent" },
        { status: "overdue" },
        { status: "draft" },
        { status: "paid" },
        { status: "cancelled" },
      ],
    });

    const item = result.items.find((i) => i.key === "unpaid_invoices");
    expect(item?.passed).toBe(false);
    expect(item?.severity).toBe("blocker");
    expect(item?.count).toBe(3);
    expect(result.hasBlockers).toBe(true);
  });

  test("non-billable entries are not counted as unbilled", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [{ billed: false, billable: false }],
      expenses: [{ billed: false, billable: false }],
      deadlines: [],
      documentRequests: [],
      invoices: [],
    });

    expect(result.hasBlockers).toBe(false);
    const timeItem = result.items.find((i) => i.key === "unbilled_time");
    expect(timeItem?.passed).toBe(true);
    expect(timeItem?.count).toBe(0);
  });

  test("deadlines without status are treated as open", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [],
      expenses: [],
      deadlines: [{ status: undefined }],
      documentRequests: [],
      invoices: [],
    });

    const item = result.items.find((i) => i.key === "open_deadlines");
    expect(item?.passed).toBe(false);
    expect(item?.count).toBe(1);
  });

  test("multiple blockers → correct blockerCount", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [{ billed: false, billable: true }],
      expenses: [{ billed: false, billable: true }],
      deadlines: [{ status: "pending" }],
      documentRequests: [{ status: "pending" }],
      invoices: [{ status: "sent" }],
    });

    expect(result.blockerCount).toBe(4);
    expect(result.warningCount).toBe(1);
    expect(result.hasBlockers).toBe(true);
  });

  test("empty case → all checks pass", () => {
    const result = evaluateCaseCloseChecklist({
      timeEntries: [],
      expenses: [],
      deadlines: [],
      documentRequests: [],
      invoices: [],
    });

    expect(result.hasBlockers).toBe(false);
    expect(result.blockerCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.items).toHaveLength(5);
  });
});
