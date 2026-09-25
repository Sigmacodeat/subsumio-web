// @vitest-environment node

import { describe, expect, test } from "vitest";
import type { ExpenseEntry } from "@/lib/legal-types";
import type { PageArrayMutateResult, PageArrayMutation } from "@/lib/server-brain";
import {
  createExpense,
  appendExpense,
  updateExpenseAtomic,
  deleteExpenseAtomic,
  markExpensesBilledAtomic,
  unbillExpensesAtomic,
  filterExpenses,
  computeExpenseSummary,
  ExpensesNotFoundError,
  ExpenseBilledError,
  EXPENSES_FIELD,
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

interface FakeCall {
  method: "appendPageArray" | "mutatePageArray";
  slug: string;
  field: string;
  payload: unknown;
}

/** Records the calls and answers with whatever result the test dictates. */
function makeArrayBrain(result?: Partial<PageArrayMutateResult>) {
  const calls: FakeCall[] = [];
  return {
    calls,
    async appendPageArray(slug: string, field: string, items: unknown[]) {
      calls.push({ method: "appendPageArray", slug, field, payload: items });
      return { slug, field, appended: items.length, length: items.length, items };
    },
    async mutatePageArray(slug: string, field: string, mutation: PageArrayMutation) {
      calls.push({ method: "mutatePageArray", slug, field, payload: mutation });
      return {
        slug,
        field,
        matched_ids: [],
        updated_ids: [],
        skipped_ids: [],
        not_found_ids: [],
        items: [],
        length: 0,
        ...result,
      };
    },
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

describe("atomic expense helpers (page_array_append / page_array_mutate)", () => {
  test("appendExpense hängt genau einen Eintrag atomar an", async () => {
    const brain = makeArrayBrain();
    const e = entry({ id: "exp-9" });
    await appendExpense(brain, "matters/m-1", e);
    expect(brain.calls).toEqual([
      { method: "appendPageArray", slug: "matters/m-1", field: EXPENSES_FIELD, payload: [e] },
    ]);
  });

  test("updateExpenseAtomic: set + billed-Guard in EINER Mutation, liefert den neuen Stand", async () => {
    const updated = entry({ amount: 99.9 });
    const brain = makeArrayBrain({
      matched_ids: ["exp-1"],
      updated_ids: ["exp-1"],
      items: [updated],
    });
    const r = await updateExpenseAtomic(brain, "matters/m-1", "exp-1", { amount: 99.9 });
    expect(r.amount).toBe(99.9);
    expect(brain.calls[0]).toMatchObject({
      method: "mutatePageArray",
      field: EXPENSES_FIELD,
      payload: { match: ["exp-1"], set: { amount: 99.9 }, unless: { eq: { billed: true } } },
    });
  });

  test("updateExpenseAtomic: abgerechnet → ExpenseBilledError (Guard hat übersprungen)", async () => {
    const brain = makeArrayBrain({ matched_ids: ["exp-1"], skipped_ids: ["exp-1"] });
    await expect(
      updateExpenseAtomic(brain, "matters/m-1", "exp-1", { amount: 1 })
    ).rejects.toBeInstanceOf(ExpenseBilledError);
  });

  test("updateExpenseAtomic: unbekannte ID → ExpensesNotFoundError", async () => {
    const brain = makeArrayBrain({ not_found_ids: ["nope"] });
    await expect(
      updateExpenseAtomic(brain, "matters/m-1", "nope", { amount: 1 })
    ).rejects.toBeInstanceOf(ExpensesNotFoundError);
  });

  test("deleteExpenseAtomic: remove + billed-Guard; Guard-Skip → ExpenseBilledError", async () => {
    const ok = makeArrayBrain({ matched_ids: ["exp-1"], updated_ids: ["exp-1"] });
    await deleteExpenseAtomic(ok, "matters/m-1", "exp-1");
    expect(ok.calls[0]).toMatchObject({
      method: "mutatePageArray",
      payload: { match: ["exp-1"], remove: true, unless: { eq: { billed: true } } },
    });

    const billed = makeArrayBrain({ matched_ids: ["exp-1"], skipped_ids: ["exp-1"] });
    await expect(deleteExpenseAtomic(billed, "matters/m-1", "exp-1")).rejects.toBeInstanceOf(
      ExpenseBilledError
    );

    const missing = makeArrayBrain({ not_found_ids: ["nope"] });
    await expect(deleteExpenseAtomic(missing, "matters/m-1", "nope")).rejects.toBeInstanceOf(
      ExpensesNotFoundError
    );
  });

  test("markExpensesBilledAtomic: Fremdrechnungs-Skip läuft im Engine-Guard, nicht im Client", async () => {
    const brain = makeArrayBrain({
      matched_ids: ["exp-1", "exp-2", "exp-3"],
      updated_ids: ["exp-1", "exp-3"],
      skipped_ids: ["exp-2"],
      not_found_ids: ["exp-9"],
    });
    const r = await markExpensesBilledAtomic(
      brain,
      "matters/m-1",
      ["exp-1", "exp-2", "exp-3", "exp-9"],
      "RE-1"
    );
    expect(brain.calls[0]).toMatchObject({
      method: "mutatePageArray",
      field: EXPENSES_FIELD,
      payload: {
        match: ["exp-1", "exp-2", "exp-3", "exp-9"],
        set: { billed: true, invoice_number: "RE-1" },
        // eq: bereits abgerechnet UND ne: unter einer anderen Rechnung — nur
        // dann überspringen; der Retry derselben Rechnung bleibt idempotent.
        unless: { eq: { billed: true }, ne: { invoice_number: "RE-1" } },
      },
    });
    expect(r).toEqual({ updated: 2, not_found: ["exp-9"], already_billed: ["exp-2"] });
  });

  test("markExpensesBilledAtomic / unbillExpensesAtomic: leere ID-Liste ruft die Engine nicht", async () => {
    const brain = makeArrayBrain();
    expect(await markExpensesBilledAtomic(brain, "matters/m-1", [], "RE-1")).toEqual({
      updated: 0,
      not_found: [],
      already_billed: [],
    });
    expect(await unbillExpensesAtomic(brain, "matters/m-1", [])).toEqual({
      updated: 0,
      not_found: [],
    });
    expect(brain.calls).toHaveLength(0);
  });

  test("unbillExpensesAtomic: billed=false + invoice_number weg in einer Mutation", async () => {
    const brain = makeArrayBrain({
      matched_ids: ["exp-1"],
      updated_ids: ["exp-1"],
      not_found_ids: ["ghost"],
    });
    const r = await unbillExpensesAtomic(brain, "matters/m-1", ["exp-1", "ghost"]);
    expect(brain.calls[0]).toMatchObject({
      method: "mutatePageArray",
      payload: { match: ["exp-1", "ghost"], set: { billed: false }, unset: ["invoice_number"] },
    });
    expect(r).toEqual({ updated: 1, not_found: ["ghost"] });
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

  test("Datumsfilter vergleicht Kalendertage — ISO-Zeitstempel fallen nicht aus `to` heraus", () => {
    const stamped = [entry({ id: "t", date: "2026-09-25T14:03:11.000Z" })];
    expect(filterExpenses(stamped, { to: "2026-09-25" }).map((e) => e.id)).toEqual(["t"]);
    expect(filterExpenses(stamped, { from: "2026-09-25" }).map((e) => e.id)).toEqual(["t"]);
    expect(filterExpenses(stamped, { to: "2026-09-24" })).toEqual([]);
  });

  test("Summen: total/billable/unbilled/billed", () => {
    const s = computeExpenseSummary(list);
    expect(s.total_amount).toBe(175);
    expect(s.billable_amount).toBe(125);
    expect(s.unbilled_amount).toBe(100);
    expect(s.billed_amount).toBe(25);
  });
});
