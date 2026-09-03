import { describe, it, expect } from "bun:test";

/**
 * Tests for the budget cap re-scaling logic in the legal pipeline.
 *
 * After discoverAllCaseDocuments expands data.part_slugs with all case
 * documents, the BudgetTracker's cost cap must be re-scaled proportionally
 * to the accumulated case size. Pre-fix, the cap was based on the trigger
 * batch (e.g. 1 document), but the pipeline processes the full accumulated
 * case (e.g. 50 docs) — BudgetExhausted would abort mid-pipeline.
 *
 * These tests verify the re-scaling formula without needing a full pipeline
 * run (which would require AI providers). We test the scaling math directly.
 */

describe("Budget cap re-scaling for accumulated cases", () => {
  // The re-scaling logic (from legal-pipeline.ts):
  //   scaleFactor = accumulatedSize / triggerBatchSize
  //   scaledCap = min(baseCostCap * scaleFactor, 500)
  //   only when: accumulatedSize > triggerBatchSize AND no explicit max_cost_usd

  function computeRescaledCap(
    baseCostCap: number,
    triggerBatchSize: number,
    accumulatedSize: number,
    hasExplicitMaxCost: boolean
  ): number {
    if (triggerBatchSize > 0 && accumulatedSize > triggerBatchSize && !hasExplicitMaxCost) {
      const scaleFactor = accumulatedSize / triggerBatchSize;
      return Math.min(baseCostCap * scaleFactor, 500);
    }
    return baseCostCap;
  }

  it("scales cap proportionally when accumulated case is larger than trigger batch", () => {
    // 1 document trigger, 50 documents accumulated, $50 base cap
    const cap = computeRescaledCap(50, 1, 50, false);
    expect(cap).toBe(500); // 50 * 50 = 2500, capped at 500
  });

  it("scales cap proportionally for moderate accumulation", () => {
    // 2 documents trigger, 10 documents accumulated, $50 base cap
    const cap = computeRescaledCap(50, 2, 10, false);
    expect(cap).toBe(250); // 50 * (10/2) = 250
  });

  it("does NOT scale when trigger batch equals accumulated size", () => {
    const cap = computeRescaledCap(50, 5, 5, false);
    expect(cap).toBe(50); // no change
  });

  it("does NOT scale when explicit max_cost_usd is set", () => {
    // User explicitly set max_cost_usd — respect it as a hard limit
    const cap = computeRescaledCap(30, 1, 50, true);
    expect(cap).toBe(30); // no scaling, user's hard limit wins
  });

  it("caps at $500 to prevent runaway costs", () => {
    // 1 document trigger, 1000 documents accumulated, $50 base cap
    const cap = computeRescaledCap(50, 1, 1000, false);
    expect(cap).toBe(500); // capped
  });

  it("does NOT scale when trigger batch is 0 (edge case)", () => {
    const cap = computeRescaledCap(50, 0, 50, false);
    expect(cap).toBe(50); // no division by zero
  });

  it("preserves DEFAULT_COST_CAP_USD when no accumulation", () => {
    // Simulates the default case: no discovery happened, trigger batch = accumulated
    const cap = computeRescaledCap(50, 3, 3, false);
    expect(cap).toBe(50);
  });

  it("scales reserved_credits-based cap (EUR→USD converted)", () => {
    // reserved_credits = 10 EUR → baseCostCap = 10 * 1.08 = $10.80
    // 1 doc trigger, 20 docs accumulated
    const baseCostCap = 10 * 1.08;
    const cap = computeRescaledCap(baseCostCap, 1, 20, false);
    expect(cap).toBeCloseTo(baseCostCap * 20, 1); // ~$216
    expect(cap).toBeLessThan(500);
  });
});
