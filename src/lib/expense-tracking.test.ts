// @vitest-environment node

import { describe, expect, test, vi } from "vitest";
import type { ExpenseEntry } from "@/lib/legal-types";
import {
  createExpense,
  updateExpenseEntry,
  deleteExpenseEntry,
  markExpensesBilled,
  unbillExpenses,
  filterExpenses,
  computeExpenseSummary,
  writeExpensesWithRetry,
  ExpensesNotFoundError,
  ExpensesWriteConflictError,
  ExpenseBilledError,
} from "@/lib/expense-tracking";

function entry(over: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "exp-1",
    description: "Gerichtskosten",
    amount: 120.5,
    date: "2026-09-20",
    billable: true,
    billed: false,
    ...over,
  };
}

describe("createExpense", () => {
  test("erzeugt Eintrag mit Default-Währung und billed=false", () => {
    const e = createExpense({ description: "Kopien", amount: 12.5, date: "2026-09-22" });
    expect(e.id).toMatch(/^exp-/);
    expect(e.currency).toBe("EUR");
    expect(e.billed).toBe(false);
    expect(e.billable).toBe(true);
  });
});

describe("updateExpenseEntry — Guards", () => {
  test("nicht gefundene ID → found:false", () => {
    const r = updateExpenseEntry([entry()], "nope", { amount: 1 });
    expect(r.found).toBe(false);
  });

  test("abgerechnete Auslage ist nicht editierbar (billed-Guard)", () => {
    const r = updateExpenseEntry([entry({ billed: true })], "exp-1", { amount: 1 });
    expect(r.found).toBe(true);
    expect(r.billed).toBe(true);
    expect(r.entries[0]!.amount).toBe(120.5);
  });

  test("offene Auslage wird aktualisiert, andere bleiben unberührt", () => {
    const list = [entry(), entry({ id: "exp-2", amount: 5 })];
    const r = updateExpenseEntry(list, "exp-2", { description: "Neu" });
    expect(r.found).toBe(true);
    expect(r.billed).toBeUndefined();
    expect(r.updated?.description).toBe("Neu");
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]!.description).toBe("Gerichtskosten");
  });
});

describe("deleteExpenseEntry — Guards", () => {
  test("nicht gefundene ID → found:false", () => {
    expect(deleteExpenseEntry([entry()], "nope").found).toBe(false);
  });

  test("abgerechnete Auslage ist nicht löschbar (billed-Guard)", () => {
    const r = deleteExpenseEntry([entry({ billed: true })], "exp-1");
    expect(r.found).toBe(true);
    expect(r.billed).toBe(true);
    expect(r.entries).toHaveLength(1);
  });

  test("offene Auslage wird entfernt", () => {
    const r = deleteExpenseEntry([entry(), entry({ id: "exp-2" })], "exp-1");
    expect(r.found).toBe(true);
    expect(r.entries.map((e) => e.id)).toEqual(["exp-2"]);
  });
});

describe("markExpensesBilled / unbillExpenses", () => {
  test("markiert gefundene IDs, meldet fehlende", () => {
    const r = markExpensesBilled([entry()], ["exp-1", "nope"], "RE-2026-001");
    expect(r.updated).toBe(1);
    expect(r.not_found).toEqual(["nope"]);
    expect(r.entries[0]!.billed).toBe(true);
    expect(r.entries[0]!.invoice_number).toBe("RE-2026-001");
  });

  test("bereits unter ANDERER Rechnung abgerechnet → already_billed, keine Umhängung", () => {
    const r = markExpensesBilled(
      [entry({ billed: true, invoice_number: "RE-ALT" })],
      ["exp-1"],
      "RE-NEU"
    );
    expect(r.already_billed).toEqual(["exp-1"]);
    expect(r.entries[0]!.invoice_number).toBe("RE-ALT");
  });

  test("Retry derselben Rechnung bleibt idempotent", () => {
    const r = markExpensesBilled(
      [entry({ billed: true, invoice_number: "RE-1" })],
      ["exp-1"],
      "RE-1"
    );
    expect(r.already_billed).toEqual([]);
    expect(r.updated).toBe(1);
  });

  test("unbill setzt billed=false und entfernt invoice_number", () => {
    const r = unbillExpenses(
      [entry({ billed: true, invoice_number: "RE-1" }), entry({ id: "exp-2" })],
      ["exp-1", "ghost"]
    );
    expect(r.updated).toBe(1);
    expect(r.not_found).toEqual(["ghost"]);
    expect(r.entries[0]!.billed).toBe(false);
    expect(r.entries[0]!.invoice_number).toBeUndefined();
    expect(r.entries[1]!.billed).toBe(false);
  });
});

describe("filterExpenses / computeExpenseSummary", () => {
  const list = [
    entry({ id: "a", amount: 100, date: "2026-09-01", billable: true }),
    entry({ id: "b", amount: 50, date: "2026-09-10", billable: false }),
    entry({ id: "c", amount: 25, date: "2026-09-20", billable: true, billed: true }),
  ];

  test("filtert billable/unbilled/Datumsbereich", () => {
    expect(filterExpenses(list, { billable: false }).map((e) => e.id)).toEqual(["b"]);
    expect(filterExpenses(list, { unbilled: true }).map((e) => e.id)).toEqual(["a", "b"]);
    expect(filterExpenses(list, { from: "2026-09-05", to: "2026-09-15" }).map((e) => e.id)).toEqual(
      ["b"]
    );
  });

  test("Summen: total/billable/unbilled/billed", () => {
    const s = computeExpenseSummary(list);
    expect(s.total_amount).toBe(175);
    expect(s.billable_amount).toBe(125);
    expect(s.unbilled_amount).toBe(100);
    expect(s.billed_amount).toBe(25);
  });
});

describe("writeExpensesWithRetry", () => {
  function brainWith(fm: Record<string, unknown>, opts?: { staleWrites?: number }) {
    let getCalls = 0;
    let stale = opts?.staleWrites ?? 0;
    return {
      getPage: vi.fn(async () => {
        getCalls += 1;
        // Simuliert: nach einem Write sieht der Verify-Read noch den alten
        // Stand (konkurrierender Writer) — erst nach `staleWrites` Versuchen
        // stimmt der Stand.
        if (stale > 0 && getCalls % 2 === 0) {
          stale -= 1;
          return { frontmatter: fm };
        }
        return { frontmatter: fm };
      }),
      updatePage: vi.fn(async (page: { frontmatter: Record<string, unknown> }) => {
        Object.assign(fm, page.frontmatter);
        return {};
      }),
    };
  }

  test("Append + Verify schreibt die neue Liste", async () => {
    const fm: Record<string, unknown> = { expenses: [entry()] };
    const brain = brainWith(fm);
    const neu = entry({ id: "exp-9" });
    const { entries } = await writeExpensesWithRetry(brain, "case-1", (fresh) => ({
      nextEntries: [...fresh, neu],
      meta: null,
    }));
    expect(entries).toHaveLength(2);
    expect((fm.expenses as ExpenseEntry[]).map((e) => e.id)).toEqual(["exp-1", "exp-9"]);
  });

  test("notFound-Outcome → ExpensesNotFoundError ohne Write", async () => {
    const brain = brainWith({ expenses: [] });
    await expect(
      writeExpensesWithRetry(brain, "case-1", () => ({ notFound: true as const }))
    ).rejects.toBeInstanceOf(ExpensesNotFoundError);
    expect(brain.updatePage).not.toHaveBeenCalled();
  });

  test("billed-Outcome → ExpenseBilledError ohne Write", async () => {
    const brain = brainWith({ expenses: [entry({ billed: true })] });
    await expect(
      writeExpensesWithRetry(brain, "case-1", () => ({ billed: true as const }))
    ).rejects.toBeInstanceOf(ExpenseBilledError);
    expect(brain.updatePage).not.toHaveBeenCalled();
  });

  test("Verify-Mismatch → Retry; anhaltender Konflikt → ExpensesWriteConflictError", async () => {
    // updatePage schreibt nie wirklich → Verify schlägt immer fehl.
    const fm: Record<string, unknown> = { expenses: [] };
    const brain = {
      getPage: vi.fn(async () => ({ frontmatter: fm })),
      updatePage: vi.fn(async () => ({})),
    };
    await expect(
      writeExpensesWithRetry(
        brain,
        "case-1",
        (fresh) => ({ nextEntries: [...fresh, entry({ id: "x" })], meta: null }),
        { warn: vi.fn(), error: vi.fn() }
      )
    ).rejects.toBeInstanceOf(ExpensesWriteConflictError);
    expect(brain.updatePage).toHaveBeenCalledTimes(5);
  });
});
