import { describe, expect, it } from "vitest";
import { tariffAmountOf, timeEntryValue } from "./time-entry-value";
import { budgetInputsFromEntries } from "./fee-agreements";

describe("timeEntryValue (W4-09)", () => {
  it("a Tarifleistung is worth its tariff amount, whatever the minutes", () => {
    expect(timeEntryValue({ minutes: 90, tariff: { amount: 431.1 } }, 250)).toBe(431.1);
    expect(tariffAmountOf({ tariff: { amount: 431.1 } })).toBe(431.1);
  });
  it("an hourly entry is minutes × rate", () => {
    expect(timeEntryValue({ minutes: 30 }, 200)).toBe(100);
    expect(tariffAmountOf({})).toBeNull();
  });
  it("the budget counts the Tarifleistung with its amount", () => {
    const r = budgetInputsFromEntries(
      [
        { minutes: 60, rate: 200 },
        { minutes: 90, tariff: { amount: 431.1 } },
      ],
      200
    );
    expect(r.trackedValue).toBe(631.1);
  });
});
