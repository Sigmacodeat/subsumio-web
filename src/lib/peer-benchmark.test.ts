import { describe, test, expect } from "vitest";
import {
  computeRealizationRate,
  computeThroughputStats,
  buildBenchmarkExport,
  applyKAnonymity,
  computePercentile,
  MIN_FIRMS_FOR_DISPLAY,
} from "./peer-benchmark";

describe("peer-benchmark", () => {
  describe("computeRealizationRate", () => {
    test("returns 0 for 0 total", () => {
      expect(computeRealizationRate(5, 0)).toBe(0);
    });

    test("returns correct ratio", () => {
      expect(computeRealizationRate(8, 10)).toBe(0.8);
    });
  });

  describe("computeThroughputStats", () => {
    test("returns zeros for empty array", () => {
      expect(computeThroughputStats([])).toEqual({ avg: 0, median: 0 });
    });

    test("computes avg and median", () => {
      const stats = computeThroughputStats([10, 20, 30, 40, 50]);
      expect(stats.avg).toBe(30);
      expect(stats.median).toBe(30);
    });

    test("computes median for even count", () => {
      const stats = computeThroughputStats([10, 20, 30, 40]);
      expect(stats.median).toBe(25);
    });
  });

  describe("buildBenchmarkExport", () => {
    test("builds export with hashed firm ID", () => {
      const exportRecord = buildBenchmarkExport({
        firmId: "kanzlei-mueller",
        legalArea: "Familienrecht",
        totalCases: 20,
        wonCases: 15,
        durations: [30, 60, 90],
        periodFrom: "2026-01-01",
        periodTo: "2026-12-31",
      });
      expect(exportRecord.firm_id_hash).toMatch(/^firm_/);
      expect(exportRecord.legal_area).toBe("Familienrecht");
      expect(exportRecord.total_cases).toBe(20);
      expect(exportRecord.won_cases).toBe(15);
      expect(exportRecord.realization_rate).toBe(0.75);
    });
  });

  describe("applyKAnonymity", () => {
    test("filters out groups with fewer than MIN_FIRMS", () => {
      const metrics = [
        {
          legal_area: "A",
          firm_count: 3,
          avg_realization_rate: 0.8,
          avg_throughput_days: 30,
          median_throughput_days: 30,
        },
        {
          legal_area: "B",
          firm_count: 10,
          avg_realization_rate: 0.7,
          avg_throughput_days: 45,
          median_throughput_days: 40,
        },
      ];
      const filtered = applyKAnonymity(metrics);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.legal_area).toBe("B");
    });
  });

  describe("computePercentile", () => {
    test("returns 50 for empty array", () => {
      expect(computePercentile(50, [])).toBe(50);
    });

    test("computes correct percentile", () => {
      expect(computePercentile(30, [10, 20, 30, 40, 50])).toBe(40);
    });
  });

  test("MIN_FIRMS_FOR_DISPLAY is at least 5", () => {
    expect(MIN_FIRMS_FOR_DISPLAY).toBeGreaterThanOrEqual(5);
  });
});
