import { describe, expect, it } from "vitest";
import {
  activeBillingRules,
  checkTimeItemBilling,
  feeAgreementRate,
  legalAreaRate,
  parseBillingIncrement,
  resolveHourlyRate,
  roundUpToIncrement,
  ruledTimeItem,
  ruledTimeItems,
  timeLineAmount,
} from "./billing-rules";
import { checkStoredInvoiceTotals, computeInvoiceTotals } from "./invoice-totals";

describe("roundUpToIncrement (OPS-16)", () => {
  it.each([
    // [recorded, increment, billed]
    [22, 10, 30],
    [7, 15, 15],
    [15, 15, 15],
    [16, 15, 30],
    [1, 1, 1],
    [59, 1, 59],
    [1, 6, 6],
    [6, 6, 6],
    [7, 6, 12],
    [1, 10, 10],
    [10, 10, 10],
    [11, 10, 20],
    [1, 60, 60],
    [60, 60, 60],
    [61, 60, 120],
  ])("%i min bei Takt %i → %i min", (recorded, increment, billed) => {
    expect(roundUpToIncrement(recorded, increment)).toBe(billed);
  });

  it("0 Minuten bleiben 0 — keine Leistung, nichts verrechnet", () => {
    for (const inc of [1, 6, 10, 15, 60]) expect(roundUpToIncrement(0, inc)).toBe(0);
    expect(roundUpToIncrement(-5, 10)).toBe(0);
    expect(roundUpToIncrement(Number.NaN, 10)).toBe(0);
  });

  it("an exact multiple from a float sum does not jump an increment", () => {
    expect(roundUpToIncrement(0.1 * 3 * 100, 10)).toBe(30);
  });

  it("without an increment the duration is unchanged", () => {
    expect(roundUpToIncrement(22, null)).toBe(22);
  });
});

describe("parseBillingIncrement", () => {
  it("accepts whole minutes 1–60 only", () => {
    expect(parseBillingIncrement("15")).toBe(15);
    expect(parseBillingIncrement(1)).toBe(1);
    expect(parseBillingIncrement("60")).toBe(60);
    for (const bad of ["0", "61", "7.5", "", "abc", null, undefined, -6]) {
      expect(parseBillingIncrement(bad)).toBeNull();
    }
  });
});

describe("activeBillingRules — opt-in", () => {
  it("is off unless billingRulesEnabled is exactly true", () => {
    expect(activeBillingRules({ abrechnungstakt: "10" })).toBeNull();
    expect(activeBillingRules({ abrechnungstakt: "10", billingRulesEnabled: false })).toBeNull();
    expect(activeBillingRules(null)).toBeNull();
    expect(
      activeBillingRules({ abrechnungstakt: "10", billingRulesEnabled: "true" as never })
    ).toBeNull();
    expect(activeBillingRules({ abrechnungstakt: "10", billingRulesEnabled: true })).toEqual({
      increment: 10,
    });
  });
});

describe("rate priority: fee agreement > practice area > firm rate", () => {
  const settings = {
    billingRulesEnabled: true,
    stundensatz: "200",
    rechtsgebietSaetze: { arbeitsrecht: 230, datenschutz: 0 },
  };

  it("fee agreement wins", () => {
    expect(
      resolveHourlyRate(undefined, { feeAgreementRate: 310, legalArea: "arbeitsrecht", settings })
    ).toEqual({ rate: 310, source: "fee_agreement" });
  });

  it("then the practice-area rate of the matter (case-insensitive)", () => {
    expect(
      resolveHourlyRate(undefined, { feeAgreementRate: null, legalArea: "Arbeitsrecht", settings })
    ).toEqual({ rate: 230, source: "legal_area" });
  });

  it("then the firm rate; an unusable area rate (0) falls through", () => {
    expect(
      resolveHourlyRate(undefined, { feeAgreementRate: null, legalArea: "Datenschutz", settings })
    ).toEqual({ rate: 200, source: "firm_default" });
    expect(
      resolveHourlyRate(undefined, { feeAgreementRate: null, legalArea: undefined, settings })
    ).toEqual({ rate: 200, source: "firm_default" });
  });

  it("no usable rate anywhere → null, nothing invented", () => {
    expect(
      resolveHourlyRate(undefined, {
        feeAgreementRate: null,
        legalArea: "Zivilrecht",
        settings: { stundensatz: "", rechtsgebietSaetze: {} },
      })
    ).toEqual({ rate: null, source: null });
  });

  it("an explicit rate on the entry (also 0 = pro bono) is kept", () => {
    expect(
      resolveHourlyRate(0, { feeAgreementRate: 310, legalArea: "arbeitsrecht", settings })
    ).toEqual({ rate: 0, source: "time_entry" });
    expect(resolveHourlyRate(180, { feeAgreementRate: 310, settings })).toEqual({
      rate: 180,
      source: "time_entry",
    });
  });

  it("legalAreaRate / feeAgreementRate helpers", () => {
    expect(legalAreaRate({ arbeitsrecht: 230 }, " ARBEITSRECHT ")).toBe(230);
    expect(legalAreaRate({ arbeitsrecht: 230 }, "")).toBeNull();
    expect(
      feeAgreementRate(
        [
          { case_slug: "cases/a", hourly_rate: 250, updated_at: "2026-01-01" },
          { case_slug: "cases/a", hourly_rate: 280, updated_at: "2026-03-01" },
          { case_slug: "cases/a", hourly_rate: undefined, updated_at: "2026-05-01" },
          { case_slug: "cases/b", hourly_rate: 999, updated_at: "2026-09-01" },
        ],
        "cases/a"
      )
    ).toBe(280);
    expect(feeAgreementRate([], "cases/a")).toBeNull();
  });
});

describe("ruledTimeItem", () => {
  const rules = { increment: 10 };
  const ctx = {
    feeAgreementRate: null,
    legalArea: "arbeitsrecht",
    settings: { stundensatz: "200", rechtsgebietSaetze: { arbeitsrecht: 230 } },
  };

  it("22 min at Takt 10 and the practice-area rate: 30 min × 230 €/h", () => {
    expect(
      ruledTimeItem({ description: "Beratung", date: "2026-09-01T10:00", minutes: 22 }, rules, ctx)
    ).toEqual({
      description: "Beratung",
      date: "2026-09-01",
      hours: 0.5,
      rate: 230,
      amount: 115,
      recorded_minutes: 22,
      billed_minutes: 30,
      rate_source: "legal_area",
    });
  });

  it("the entry itself is not changed", () => {
    const entry = { description: "x", date: "2026-09-01", minutes: 22 };
    ruledTimeItem(entry, rules, ctx);
    expect(entry.minutes).toBe(22);
  });

  it("counts entries without a rate", () => {
    const out = ruledTimeItems([{ description: "x", minutes: 10 }], rules, {
      feeAgreementRate: null,
      settings: { stundensatz: "" },
    });
    expect(out).toEqual({ items: [], missingRate: 1 });
  });
});

describe("server check = client calculation", () => {
  const rules = { increment: 15 };
  const ctx = { feeAgreementRate: 240, settings: { stundensatz: "200" } };
  const entries = [
    { description: "Telefonat", date: "2026-09-01", minutes: 7 },
    { description: "Schriftsatz", date: "2026-09-02", minutes: 95 },
    { description: "E-Mail", date: "2026-09-03", minutes: 20 },
  ];

  function invoiceFm(items: Array<Record<string, unknown>>) {
    const totals = computeInvoiceTotals({ items: items as never, vatRate: 0.2 });
    return {
      items,
      time_entry_ids: ["t1", "t2", "t3"],
      vat_rate: 0.2,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    };
  }

  it("positions built by the client pass the server check", () => {
    const { items } = ruledTimeItems(entries, rules, ctx);
    const fm = invoiceFm(items as never);
    expect(checkTimeItemBilling(fm, rules)).toEqual([]);
    expect(checkStoredInvoiceTotals(fm)).toEqual([]);
    expect(items.map((i) => i.billed_minutes)).toEqual([15, 105, 30]);
    expect(items.map((i) => i.amount)).toEqual([timeLineAmount(15, 240), 420, 120]);
  });

  it("unrounded minutes are refused while the rules are on", () => {
    const { items } = ruledTimeItems(entries, { increment: null }, ctx);
    expect(checkTimeItemBilling(invoiceFm(items as never), rules)).toContain(
      "items[0].billed_minutes"
    );
  });

  it("rounding is refused while the rules are off", () => {
    const { items } = ruledTimeItems(entries, rules, ctx);
    expect(checkTimeItemBilling(invoiceFm(items as never), null)).toContain(
      "items[0].billed_minutes"
    );
  });

  it("an amount that does not follow from billed minutes × rate is refused", () => {
    const { items } = ruledTimeItems(entries, rules, ctx);
    items[1] = { ...items[1], amount: items[1].amount + 1 };
    expect(checkTimeItemBilling(invoiceFm(items as never), rules)).toContain("items[1].amount");
  });

  it("rules on: every billed time entry needs its ruled position", () => {
    const legacy = [{ description: "x", date: "2026-09-01", hours: 1, rate: 200, amount: 200 }];
    expect(checkTimeItemBilling({ ...invoiceFm(legacy), time_entry_ids: ["t1"] }, rules)).toEqual([
      "time_items",
    ]);
  });

  it("rules off: legacy positions without minutes pass unchanged", () => {
    const legacy = [{ description: "x", date: "2026-09-01", hours: 1.5, rate: 200, amount: 300 }];
    expect(checkTimeItemBilling({ ...invoiceFm(legacy), time_entry_ids: ["t1"] }, null)).toEqual(
      []
    );
  });

  it("an unknown rate_source is refused", () => {
    const { items } = ruledTimeItems(entries, rules, ctx);
    const bad = [{ ...items[0], rate_source: "made_up" }, items[1], items[2]];
    expect(checkTimeItemBilling(invoiceFm(bad), rules)).toContain("items[0].rate_source");
  });
});
