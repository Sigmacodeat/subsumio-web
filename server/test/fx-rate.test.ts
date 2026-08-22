import { describe, it, expect } from "bun:test";
import { withEnv } from "./helpers/with-env.ts";
import { getEurUsdRate, eurToUsd } from "../src/core/budget/fx-rate.ts";

describe("FX Rate Config", () => {
  it("getEurUsdRate returns a positive number", () => {
    const rate = getEurUsdRate();
    expect(rate).toBeGreaterThan(0);
    expect(Number.isFinite(rate)).toBe(true);
  });

  it("eurToUsd converts EUR to USD correctly", () => {
    const eur = 10;
    const usd = eurToUsd(eur);
    const rate = getEurUsdRate();
    expect(usd).toBeCloseTo(eur * rate, 2);
  });

  it("eurToUsd(0) returns 0", () => {
    expect(eurToUsd(0)).toBe(0);
  });

  it("respects SUBSUMIO_EUR_USD_RATE env var override", async () => {
    await withEnv({ SUBSUMIO_EUR_USD_RATE: "1.15" }, async () => {
      expect(getEurUsdRate()).toBe(1.15);
      expect(eurToUsd(100)).toBeCloseTo(115, 1);
    });
  });

  it("falls back to default when env var is invalid", async () => {
    await withEnv({ SUBSUMIO_EUR_USD_RATE: "not-a-number" }, async () => {
      const rate = getEurUsdRate();
      expect(rate).toBeGreaterThan(0);
      expect(Number.isFinite(rate)).toBe(true);
    });
  });

  it("falls back to default when env var is zero or negative", async () => {
    await withEnv({ SUBSUMIO_EUR_USD_RATE: "0" }, async () => {
      expect(getEurUsdRate()).toBeGreaterThan(0);
    });
  });
});
