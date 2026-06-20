import { describe, test, expect } from "vitest";
import { currentMonth } from "./datetime";

describe("currentMonth", () => {
  test("returns YYYY-MM format", () => {
    const result = currentMonth();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  test("returns current year and month", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(currentMonth()).toBe(expected);
  });

  test("pads single-digit months with leading zero", () => {
    const result = currentMonth();
    const [, month] = result.split("-");
    expect(month).toHaveLength(2);
  });
});
