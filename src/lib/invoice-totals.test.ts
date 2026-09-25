// @vitest-environment node
import { describe, expect, test } from "vitest";
import { computeInvoiceTotals, lineAmount, parseHourlyRate } from "./invoice-totals";

describe("computeInvoiceTotals (audit QA-10)", () => {
  test("3 × 0,1 h à 190 € with 20 % VAT: lines, subtotal, VAT and total agree", () => {
    const items = [1, 2, 3].map(() => ({ amount: lineAmount(0.1, 190) }));
    expect(items[0].amount).toBe(19);
    const t = computeInvoiceTotals({ items, vatRate: 0.2 });
    expect(t.subtotal).toBe(57);
    expect(t.tax).toBe(11.4);
    expect(t.total).toBe(68.4);
  });

  test("float-prone amounts sum exactly (0,10 + 0,20 = 0,30)", () => {
    const t = computeInvoiceTotals({ items: [{ amount: 0.1 }, { amount: 0.2 }], vatRate: 0 });
    expect(t.subtotal).toBe(0.3);
  });

  test("disbursements are VAT-able; the advance is deducted after VAT, never below zero", () => {
    const t = computeInvoiceTotals({
      items: [{ amount: 600 }],
      expenses: [{ amount: 50 }],
      vatRate: 0.2,
      advance: 100,
    });
    expect(t).toEqual({
      subtotal: 600,
      expenseTotal: 50,
      taxableBase: 650,
      tax: 130,
      advance: 100,
      total: 680,
    });
    expect(computeInvoiceTotals({ items: [{ amount: 10 }], vatRate: 0.2, advance: 50 }).total).toBe(
      0
    );
  });

  test("VAT is rounded once on the cent base (half-up)", () => {
    // 10,05 € × 20 % = 2,01 €
    expect(computeInvoiceTotals({ items: [{ amount: 10.05 }], vatRate: 0.2 }).tax).toBe(2.01);
  });

  test("dialog and Copilot share the function: same input, same totals", () => {
    const input = { items: [{ amount: 123.45 }, { amount: 67.89 }], vatRate: 0.2 };
    expect(computeInvoiceTotals(input)).toEqual(computeInvoiceTotals({ ...input, expenses: [] }));
  });
});

describe("parseHourlyRate", () => {
  test("keeps cents and accepts a decimal comma", () => {
    expect(parseHourlyRate("187,50")).toBe(187.5);
    expect(parseHourlyRate("187.50")).toBe(187.5);
    expect(parseHourlyRate("190")).toBe(190);
  });

  test("no configured rate → null (no silent 200 €)", () => {
    expect(parseHourlyRate(undefined)).toBeNull();
    expect(parseHourlyRate("")).toBeNull();
    expect(parseHourlyRate("abc")).toBeNull();
    expect(parseHourlyRate("0")).toBeNull();
  });
});
