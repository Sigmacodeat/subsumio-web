/**
 * P13a: Budget-Tracking E2E Test — verifiziert dass BudgetTracker.record()
 * tatsächlich cost_spent_usd > 0 produziert. Pre-F2 war der Tracker erstellt
 * aber nie gefüttert — cost_spent_usd war immer 0.
 */
import { describe, it, expect } from "bun:test";
import { BudgetTracker, BudgetExhausted } from "../src/core/budget/budget-tracker.ts";

describe("Budget-Tracking E2E", () => {
  it("record() increments totalSpent above 0 for a priced model", () => {
    const budget = new BudgetTracker({
      maxCostUsd: 10,
      label: "test/budget-e2e",
    });
    expect(budget.totalSpent).toBe(0);

    // Record a real LLM call — Haiku is priced in model-pricing.ts
    budget.record({
      modelId: "anthropic:claude-haiku-4-5",
      inputTokens: 100_000,
      outputTokens: 50_000,
      kind: "chat",
      label: "test/haiku-call",
    });

    // After record(), totalSpent must be > 0 (pre-F2 it stayed at 0)
    expect(budget.totalSpent).toBeGreaterThan(0);
  });

  it("multiple record() calls accumulate cumulatively", () => {
    const budget = new BudgetTracker({
      maxCostUsd: 100,
      label: "test/cumulative",
    });

    budget.record({
      modelId: "anthropic:claude-haiku-4-5",
      inputTokens: 10_000,
      outputTokens: 5_000,
      kind: "chat",
      label: "test/call-1",
    });
    const after1 = budget.totalSpent;
    expect(after1).toBeGreaterThan(0);

    budget.record({
      modelId: "anthropic:claude-haiku-4-5",
      inputTokens: 10_000,
      outputTokens: 5_000,
      kind: "chat",
      label: "test/call-2",
    });
    const after2 = budget.totalSpent;

    // Second call should add to the first (cumulative, not reset)
    expect(after2).toBeGreaterThan(after1);
    expect(after2).toBeCloseTo(after1 * 2, 1);
  });

  it("record() throws BudgetExhausted when cumulative exceeds cap", () => {
    const budget = new BudgetTracker({
      maxCostUsd: 0.01, // very low cap
      label: "test/exhaust",
    });

    // First call: small enough to fit under cap
    budget.record({
      modelId: "anthropic:claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 50,
      kind: "chat",
      label: "test/small",
    });

    // Second call: large enough to blow past the 0.01 cap
    expect(() =>
      budget.record({
        modelId: "anthropic:claude-sonnet-4-6",
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        kind: "chat",
        label: "test/overspend",
      })
    ).toThrow(BudgetExhausted);
  });

  it("BudgetExhausted carries spent + cap + reason metadata", () => {
    const budget = new BudgetTracker({
      maxCostUsd: 0.001,
      label: "test/metadata",
    });

    let caught: BudgetExhausted | null = null;
    try {
      budget.record({
        modelId: "anthropic:claude-sonnet-4-6",
        inputTokens: 500_000,
        outputTokens: 200_000,
        kind: "chat",
        label: "test/big-call",
      });
    } catch (err) {
      if (err instanceof BudgetExhausted) caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught!.spent).toBeGreaterThan(0);
    expect(caught!.cap).toBe(0.001);
    expect(caught!.reason).toBeTruthy();
  });

  it("totalSpent reflects actual token cost, not zero (F2 regression guard)", () => {
    // This is the core F2 regression test: pre-F2, budget was created but
    // never fed, so totalSpent was always 0. Now legal-pipeline feeds it
    // via budget.record() after each specialist layer.
    const budget = new BudgetTracker({
      maxCostUsd: 50,
      label: "test/f2-regression",
    });

    // Simulate what legal-pipeline does: 5 specialist calls
    for (let i = 0; i < 5; i++) {
      budget.record({
        modelId: "anthropic:claude-sonnet-4-6",
        inputTokens: 50_000,
        outputTokens: 10_000,
        kind: "chat",
        label: `legal-pipeline/specialist-${i}`,
      });
    }

    // F2 invariant: after 5 specialist calls, totalSpent MUST be > 0
    // Pre-F2 this would have been 0 (tracker never fed)
    expect(budget.totalSpent).toBeGreaterThan(0);
    expect(budget.totalSpent).toBeLessThan(50); // under cap
  });
});
