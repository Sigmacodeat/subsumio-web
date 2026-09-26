import { describe, expect, it } from "vitest";
import {
  parseHourlyRate,
  checkStoredInvoiceTotals,
  computeInvoiceTotals,
  lineAmount,
  rateFraction,
  toCents,
} from "./invoice-totals";

describe("lineAmount — commercial rounding like every other amount (R6-11)", () => {
  it("rounds half a cent up", () => {
    expect(lineAmount(0.1, 160.45)).toBe(16.05);
    expect(lineAmount(0.5, 2.01)).toBe(1.01);
  });

  it("matches an integer reference over a grid of hours × rates", () => {
    // Hours in tenths, rates in cents: amount × 1000 = (hours × 10) × (rate × 100);
    // the reference rounds that half up to whole cents in integers.
    for (let h10 = 1; h10 <= 100; h10 += 3) {
      for (let r100 = 10_000; r100 <= 40_000; r100 += 35) {
        const milli = h10 * r100;
        const cents = Math.floor(milli / 10) + (milli % 10 >= 5 ? 1 : 0);
        expect(Math.round(lineAmount(h10 / 10, r100 / 100) * 100)).toBe(cents);
      }
    }
  });
});

describe("computeInvoiceTotals (cents, VAT per rate)", () => {
  it("sums in cents — no float artefacts", () => {
    const t = computeInvoiceTotals({
      items: [{ amount: 0.1 }, { amount: 0.2 }],
      vatRate: 0.2,
    });
    expect(t.subtotal).toBe(0.3);
    expect(t.tax).toBe(0.06);
    expect(t.total).toBe(0.36);
  });

  it("fee 1000 + court fee 100 at 0 % → VAT 200, total 1300", () => {
    const t = computeInvoiceTotals({
      items: [{ amount: 1000 }],
      expenses: [{ amount: 100, vat_rate: 0 }],
      vatRate: 0.2,
    });
    expect(t).toMatchObject({
      subtotal: 1000,
      expense_total: 100,
      tax: 200,
      gross: 1300,
      total: 1300,
    });
    expect(t.tax_breakdown).toEqual([
      { rate: 0.2, net: 1000, tax: 200 },
      { rate: 0, net: 100, tax: 0 },
    ]);
  });

  it("an expense without its own rate takes the invoice rate; percent is read as percent", () => {
    const t = computeInvoiceTotals({
      items: [],
      expenses: [{ amount: 50 }, { amount: 50, vat_rate: 20 }],
      vatRate: 0.2,
    });
    expect(t.tax).toBe(20);
    expect(t.tax_breakdown).toEqual([{ rate: 0.2, net: 100, tax: 20 }]);
  });

  it("reverse charge: no VAT at all", () => {
    const t = computeInvoiceTotals({
      items: [{ amount: 1000 }],
      expenses: [{ amount: 100, vat_rate: 20 }],
      vatRate: 0.2,
      reverseCharge: true,
    });
    expect(t.tax).toBe(0);
    expect(t.total).toBe(1100);
  });

  it("advance payment: total is the payable rest, gross stays net + VAT", () => {
    const t = computeInvoiceTotals({
      items: [{ amount: 1000 }],
      vatRate: 0.2,
      advancePayment: 600,
    });
    expect(t.gross).toBe(1200);
    expect(t.total).toBe(600);
  });

  it("negative (Storno) amounts keep their sign", () => {
    const t = computeInvoiceTotals({ items: [{ amount: -1000 }], vatRate: 0.2 });
    expect(t.tax).toBe(-200);
    expect(t.total).toBe(-1200);
  });

  it("helpers", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.30000000000000004)).toBe(30);
    expect(rateFraction(20, 0)).toBe(0.2);
    expect(rateFraction(0.13, 0)).toBe(0.13);
    expect(rateFraction(undefined, 0.2)).toBe(0.2);
    expect(rateFraction(0, 0.2)).toBe(0);
  });
});

describe("checkStoredInvoiceTotals", () => {
  const good = {
    items: [{ amount: 100 }],
    expenses: [{ amount: 10, vat_rate: 0 }],
    vat_rate: 0.2,
    subtotal: 100,
    expense_total: 10,
    tax: 20,
    total: 130,
  };
  it("consistent invoice → no findings (float noise tolerated)", () => {
    expect(checkStoredInvoiceTotals(good)).toEqual([]);
    expect(checkStoredInvoiceTotals({ ...good, subtotal: 100.00000000001 })).toEqual([]);
  });
  it("names every field that does not add up", () => {
    expect(checkStoredInvoiceTotals({ ...good, total: 131 })).toEqual(["total"]);
    expect(checkStoredInvoiceTotals({ ...good, tax: 22, total: 132 })).toEqual(["tax", "total"]);
    expect(checkStoredInvoiceTotals({ ...good, total: undefined })).toEqual(["total"]);
  });
  it("legacy invoice without expense_total and without expenses is fine", () => {
    expect(
      checkStoredInvoiceTotals({
        items: [{ amount: 50 }],
        vat_rate: 0.2,
        subtotal: 50,
        tax: 10,
        total: 60,
      })
    ).toEqual([]);
  });
});

describe("parseHourlyRate", () => {
  it.each([
    ["190", 190],
    ["187,50", 187.5],
    ["1.234,50", 1234.5],
    ["187.50", 187.5],
    ["€ 250", 250],
  ])("%s → %s", (input, expected) => {
    expect(parseHourlyRate(input)).toBe(expected);
  });
  it("returns null for missing or non-positive rates", () => {
    expect(parseHourlyRate("")).toBeNull();
    expect(parseHourlyRate("0")).toBeNull();
    expect(parseHourlyRate(null)).toBeNull();
  });
});
