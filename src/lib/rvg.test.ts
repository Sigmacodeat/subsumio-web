// @vitest-environment node

import { describe, test, expect } from "vitest";
import { calculateRvg } from "./rvg";

describe("calculateRvg — RVG 2025 Stufenformel (KostBRÄG 2025)", () => {
  test("returns zero basis for zero Streitwert", () => {
    const result = calculateRvg(0);
    expect(result.basisGebuehr).toBe(0);
    expect(result.verfahrensgebuehr).toBe(0);
  });

  test("returns zero for negative Streitwert", () => {
    const result = calculateRvg(-1000);
    expect(result.basisGebuehr).toBe(0);
    expect(result.streitwert).toBe(0);
  });

  test("returns zero for NaN Streitwert", () => {
    const result = calculateRvg(NaN);
    expect(result.basisGebuehr).toBe(0);
    expect(result.streitwert).toBe(0);
  });

  test("returns zero for Infinity Streitwert", () => {
    const result = calculateRvg(Infinity);
    expect(result.basisGebuehr).toBe(0);
    expect(result.streitwert).toBe(0);
  });

  test("base fee for 500€ = 51.50 (Grundgebühr)", () => {
    const result = calculateRvg(500);
    expect(result.basisGebuehr).toBe(51.5);
  });

  test("base fee for 1000€ = 51.50 + 41.50 = 93.00", () => {
    const result = calculateRvg(1000);
    expect(result.basisGebuehr).toBe(93.0);
  });

  test("base fee for 2000€ = 51.50 + 3×41.50 = 176.00", () => {
    const result = calculateRvg(2000);
    expect(result.basisGebuehr).toBe(176.0);
  });

  test("base fee for 10000€ = 176 + 8×59.50 = 652.00", () => {
    const result = calculateRvg(10000);
    expect(result.basisGebuehr).toBe(652.0);
  });

  test("Verfahrensgebühr = 1.3 × basis (rounded to 2 decimals)", () => {
    const result = calculateRvg(10000);
    expect(result.verfahrensgebuehr).toBe(Math.round(652 * 1.3 * 100) / 100);
  });

  test("Terminsgebühr = 1.2 × basis (rounded to 2 decimals)", () => {
    const result = calculateRvg(10000);
    expect(result.terminsgebuehr).toBe(Math.round(652 * 1.2 * 100) / 100);
  });

  test("Einigungsgebühr = 1.0 × basis", () => {
    const result = calculateRvg(10000);
    expect(result.einigungsgebuehr).toBe(652.0);
  });

  test("Auslagenpauschale is 20€", () => {
    const result = calculateRvg(5000);
    expect(result.auslagenpauschale).toBe(20);
  });

  test("MwSt is 19% on net sum", () => {
    const result = calculateRvg(10000);
    const expectedMwst = Math.round(result.summeNetto * 0.19 * 100) / 100;
    expect(result.mwst).toBe(expectedMwst);
  });

  test("brutto = netto + mwst", () => {
    const result = calculateRvg(10000);
    expect(result.summeBrutto).toBe(Math.round((result.summeNetto + result.mwst) * 100) / 100);
  });

  test("summeNetto includes all fees (verfahren + termins + einigung + auslagen)", () => {
    const result = calculateRvg(3000);
    expect(result.summeNetto).toBe(
      Math.round(
        (result.verfahrensgebuehr +
          result.terminsgebuehr +
          result.einigungsgebuehr +
          result.auslagenpauschale) *
          100
      ) / 100
    );
  });

  test("result has all required fields", () => {
    const result = calculateRvg(5000);
    expect(result).toHaveProperty("streitwert");
    expect(result).toHaveProperty("basisGebuehr");
    expect(result).toHaveProperty("verfahrensgebuehr");
    expect(result).toHaveProperty("terminsgebuehr");
    expect(result).toHaveProperty("einigungsgebuehr");
    expect(result).toHaveProperty("auslagenpauschale");
    expect(result).toHaveProperty("summeNetto");
    expect(result).toHaveProperty("mwst");
    expect(result).toHaveProperty("summeBrutto");
  });

  test("very large Streitwert still produces a finite result", () => {
    const result = calculateRvg(10_000_000);
    expect(Number.isFinite(result.basisGebuehr)).toBe(true);
    expect(Number.isFinite(result.summeBrutto)).toBe(true);
    expect(result.basisGebuehr).toBeGreaterThan(1000);
  });
});
