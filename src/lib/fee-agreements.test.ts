import { describe, expect, it } from "vitest";
import { budgetInputsFromEntries, computeBudgetStatus, createFeeAgreement } from "./fee-agreements";

describe("budget: billed work counts once (GELD-20)", () => {
  const agreement = createFeeAgreement({
    case_slug: "cases/a",
    model: "capped",
    hourly_rate: 300,
    budget_cap: 900,
  });

  it("2 h billed + 1 h open at 300, cap 900 → total 900, critical only at ≥ 900", () => {
    const inputs = budgetInputsFromEntries(
      [
        { minutes: 120, billed: true },
        { minutes: 60, billed: false },
      ],
      300
    );
    expect(inputs).toEqual({ minutes: 60, trackedValue: 300, billedAmount: 600 });
    const status = computeBudgetStatus(agreement, { ...inputs, hourlyRate: 300 });
    expect(status.total_value).toBe(900);
    expect(status.alert_level).toBe("critical");

    const below = computeBudgetStatus(
      agreement,
      budgetInputsFromEntries(
        [
          { minutes: 120, billed: true },
          { minutes: 30, billed: false },
        ],
        300
      )
    );
    expect(below.total_value).toBe(750);
    expect(below.alert_level).toBe("warning");
  });

  it("non-billable entries and per-entry rates", () => {
    const inputs = budgetInputsFromEntries(
      [
        { minutes: 60, rate: 200 },
        { minutes: 60, billable: false },
      ],
      300
    );
    expect(inputs).toEqual({ minutes: 60, trackedValue: 200, billedAmount: 0 });
  });
});
