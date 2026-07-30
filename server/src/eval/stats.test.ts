import { describe, it, expect } from "vitest";
import {
  percentile,
  latencyPercentiles,
  wilsonCI,
  bootstrapCI,
  bootstrapMeanCI,
  formatCI,
} from "./stats.ts";

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("computes p50 correctly", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("computes p95 correctly", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it("computes p99 correctly", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 99)).toBe(99);
  });
});

describe("latencyPercentiles", () => {
  it("returns zeros for empty array", () => {
    const result = latencyPercentiles([]);
    expect(result.p50).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.p99).toBe(0);
    expect(result.avg).toBe(0);
  });

  it("computes correct percentiles and average", () => {
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const result = latencyPercentiles(latencies);
    expect(result.p50).toBe(50);
    expect(result.p95).toBe(100);
    expect(result.avg).toBe(55);
  });
});

describe("wilsonCI", () => {
  it("returns zeros for total=0", () => {
    const ci = wilsonCI(0, 0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
    expect(ci.point).toBe(0);
  });

  it("computes CI for 100% success rate", () => {
    const ci = wilsonCI(10, 10);
    expect(ci.point).toBe(1.0);
    expect(ci.upper).toBe(1.0);
    expect(ci.lower).toBeLessThan(1.0);
    expect(ci.lower).toBeGreaterThan(0.5);
  });

  it("computes CI for 0% success rate", () => {
    const ci = wilsonCI(0, 10);
    expect(ci.point).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
    expect(ci.upper).toBeLessThan(0.5);
  });

  it("computes CI for 50% success rate", () => {
    const ci = wilsonCI(50, 100);
    expect(ci.point).toBe(0.5);
    expect(ci.lower).toBeGreaterThan(0.3);
    expect(ci.upper).toBeLessThan(0.7);
  });
});

describe("bootstrapCI", () => {
  it("returns zeros for empty array", () => {
    const ci = bootstrapCI([]);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
    expect(ci.point).toBe(0);
  });

  it("computes CI for all-ones (100% hit rate)", () => {
    const ci = bootstrapCI([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(ci.point).toBe(1.0);
    expect(ci.lower).toBe(1.0);
    expect(ci.upper).toBe(1.0);
  });

  it("computes CI for all-zeros (0% hit rate)", () => {
    const ci = bootstrapCI([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(ci.point).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
  });

  it("computes CI for 80% hit rate with reasonable bounds", () => {
    const values = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0];
    const ci = bootstrapCI(values, 2000);
    expect(ci.point).toBe(0.8);
    expect(ci.lower).toBeGreaterThan(0.4);
    expect(ci.upper).toBeLessThanOrEqual(1.0);
  });

  it("is deterministic (same seed → same result)", () => {
    const values = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
    const ci1 = bootstrapCI(values);
    const ci2 = bootstrapCI(values);
    expect(ci1.lower).toBe(ci2.lower);
    expect(ci1.upper).toBe(ci2.upper);
  });
});

describe("bootstrapMeanCI", () => {
  it("returns zeros for empty array", () => {
    const ci = bootstrapMeanCI([]);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
  });

  it("computes CI for MRR-like values", () => {
    const values = [1.0, 0.5, 0.333, 0.25, 0.2, 0.0, 0.0, 1.0, 0.5, 0.333];
    const ci = bootstrapMeanCI(values);
    expect(ci.point).toBeCloseTo(0.4116, 1);
    expect(ci.lower).toBeLessThan(ci.point);
    expect(ci.upper).toBeGreaterThan(ci.point);
  });

  it("is deterministic", () => {
    const values = [0.5, 0.3, 0.8, 0.1, 0.9];
    const ci1 = bootstrapMeanCI(values);
    const ci2 = bootstrapMeanCI(values);
    expect(ci1.lower).toBe(ci2.lower);
    expect(ci1.upper).toBe(ci2.upper);
  });
});

describe("formatCI", () => {
  it("formats CI as percentage with bounds", () => {
    const formatted = formatCI({ lower: 0.7, upper: 0.9, point: 0.8 });
    expect(formatted).toBe("80.0% [70.0%–90.0%]");
  });
});
