import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { _resetOcrBudget, reserveOcrPages, withOcrOwner } from "../src/core/ocr-budget.ts";

const saved = process.env.GBRAIN_OCR_DAILY_PAGES_PER_FIRM;
beforeEach(() => {
  _resetOcrBudget();
  process.env.GBRAIN_OCR_DAILY_PAGES_PER_FIRM = "100";
});
afterEach(() => {
  if (saved === undefined) delete process.env.GBRAIN_OCR_DAILY_PAGES_PER_FIRM;
  else process.env.GBRAIN_OCR_DAILY_PAGES_PER_FIRM = saved;
});

describe("daily OCR page budget per firm", () => {
  test("OCR pages count against the firm; beyond the budget none are granted", async () => {
    const day = new Date("2026-09-26T10:00:00Z");
    expect(await withOcrOwner("kanzlei-a", async () => reserveOcrPages(80, day))).toBe(80);
    expect(await withOcrOwner("kanzlei-a", async () => reserveOcrPages(50, day))).toBe(20);
    expect(await withOcrOwner("kanzlei-a", async () => reserveOcrPages(10, day))).toBe(0);
    // Another firm has its own budget.
    expect(await withOcrOwner("kanzlei-b", async () => reserveOcrPages(50, day))).toBe(50);
  });

  test("a new day starts a new budget", async () => {
    await withOcrOwner("kanzlei-a", async () =>
      reserveOcrPages(100, new Date("2026-09-26T10:00:00Z"))
    );
    expect(
      await withOcrOwner("kanzlei-a", async () =>
        reserveOcrPages(30, new Date("2026-09-27T01:00:00Z"))
      )
    ).toBe(30);
  });

  test("without a firm context (CLI, maintenance) nothing is limited", () => {
    expect(reserveOcrPages(500)).toBe(500);
  });
});
