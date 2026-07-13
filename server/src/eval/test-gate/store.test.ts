import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { saveGateResult, toTrendEntry, readTrend, compareWithPrevious } from "./store.ts";
import type { GateResult, GateTier, TrendEntry } from "./types.ts";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const BASE_DIR = join(dirname(new URL(import.meta.url).pathname), "..", "test-gate");
const TEST_TIER: GateTier = "smoke";

function makeResult(overrides: Partial<GateResult> = {}): GateResult {
  return {
    tier: TEST_TIER,
    timestamp: new Date().toISOString(),
    runner: "test",
    duration_ms: 5000,
    passed: 3,
    failed: 0,
    skipped: 0,
    errored: 0,
    overall_status: "pass",
    checks: [
      {
        id: "typecheck-frontend",
        name: "TypeScript Frontend",
        category: "typecheck",
        status: "pass",
        duration_ms: 1000,
        exit_code: 0,
      },
      {
        id: "lint",
        name: "ESLint",
        category: "lint",
        status: "pass",
        duration_ms: 500,
        exit_code: 0,
      },
      {
        id: "unit-key",
        name: "Key Unit Tests",
        category: "unit",
        status: "pass",
        duration_ms: 2000,
        exit_code: 0,
      },
    ],
    ...overrides,
  };
}

describe("test-gate store", () => {
  beforeEach(() => {
    // Clean up test artifacts before each test
    const artifactDir = join(BASE_DIR, "artifacts", TEST_TIER);
    const trendPath = join(BASE_DIR, "trends", `${TEST_TIER}.jsonl`);
    if (existsSync(artifactDir)) rmSync(artifactDir, { recursive: true });
    if (existsSync(trendPath)) rmSync(trendPath);
  });

  afterEach(() => {
    // Clean up after tests
    const artifactDir = join(BASE_DIR, "artifacts", TEST_TIER);
    const trendPath = join(BASE_DIR, "trends", `${TEST_TIER}.jsonl`);
    if (existsSync(artifactDir)) rmSync(artifactDir, { recursive: true });
    if (existsSync(trendPath)) rmSync(trendPath);
  });

  describe("toTrendEntry", () => {
    it("converts gate result to trend entry", () => {
      const result = makeResult();
      const trend = toTrendEntry(result);
      expect(trend.timestamp).toBe(result.timestamp);
      expect(trend.overall_status).toBe("pass");
      expect(trend.passed).toBe(3);
      expect(trend.failed).toBe(0);
      expect(trend.duration_ms).toBe(5000);
    });

    it("aggregates check categories in summary", () => {
      const result = makeResult();
      const trend = toTrendEntry(result);
      expect(trend.check_summary.typecheck.pass).toBe(1);
      expect(trend.check_summary.lint.pass).toBe(1);
      expect(trend.check_summary.unit.pass).toBe(1);
    });

    it("counts failures by category", () => {
      const result = makeResult({
        passed: 2,
        failed: 1,
        overall_status: "fail",
        checks: [
          {
            id: "typecheck-frontend",
            name: "TypeScript Frontend",
            category: "typecheck",
            status: "pass",
            duration_ms: 1000,
            exit_code: 0,
          },
          {
            id: "lint",
            name: "ESLint",
            category: "lint",
            status: "pass",
            duration_ms: 500,
            exit_code: 0,
          },
          {
            id: "unit-key",
            name: "Key Unit Tests",
            category: "unit",
            status: "fail",
            duration_ms: 2000,
            exit_code: 1,
          },
        ],
      });
      const trend = toTrendEntry(result);
      expect(trend.check_summary.unit.fail).toBe(1);
      expect(trend.check_summary.unit.pass).toBe(0);
    });
  });

  describe("saveGateResult", () => {
    it("writes artifact JSON file", () => {
      const result = makeResult();
      const { artifactPath } = saveGateResult(result);
      expect(existsSync(artifactPath)).toBe(true);
    });

    it("writes timestamped copy", () => {
      const result = makeResult();
      saveGateResult(result);
      const dir = join(BASE_DIR, "artifacts", TEST_TIER);
      const files = existsSync(dir) ? require("node:fs").readdirSync(dir) : [];
      // Should have latest + timestamped
      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it("appends to trend JSONL", () => {
      const result = makeResult();
      const { trendPath } = saveGateResult(result);
      expect(existsSync(trendPath)).toBe(true);
      const trend = readTrend(TEST_TIER);
      expect(trend.length).toBe(1);
      expect(trend[0].overall_status).toBe("pass");
    });

    it("appends multiple entries to trend", () => {
      saveGateResult(makeResult({ timestamp: "2026-01-01T00:00:00.000Z" }));
      saveGateResult(makeResult({ timestamp: "2026-01-02T00:00:00.000Z" }));
      const trend = readTrend(TEST_TIER);
      expect(trend.length).toBe(2);
      expect(trend[0].timestamp).toBe("2026-01-01T00:00:00.000Z");
      expect(trend[1].timestamp).toBe("2026-01-02T00:00:00.000Z");
    });
  });

  describe("readTrend", () => {
    it("returns empty array when no trend file exists", () => {
      const trend = readTrend("holdout" as GateTier);
      expect(trend).toEqual([]);
    });
  });

  describe("compareWithPrevious", () => {
    it("returns empty arrays when no previous result", () => {
      const current = makeResult();
      const cmp = compareWithPrevious(current, null);
      expect(cmp.new_failures).toEqual([]);
      expect(cmp.new_passes).toEqual([]);
      expect(cmp.regressions).toEqual([]);
    });

    it("detects regressions", () => {
      const previous = makeResult();
      const current = makeResult({
        passed: 2,
        failed: 1,
        overall_status: "fail",
        checks: [
          {
            id: "typecheck-frontend",
            name: "TypeScript Frontend",
            category: "typecheck",
            status: "pass",
            duration_ms: 1000,
            exit_code: 0,
          },
          {
            id: "lint",
            name: "ESLint",
            category: "lint",
            status: "pass",
            duration_ms: 500,
            exit_code: 0,
          },
          {
            id: "unit-key",
            name: "Key Unit Tests",
            category: "unit",
            status: "fail",
            duration_ms: 2000,
            exit_code: 1,
          },
        ],
      });
      const cmp = compareWithPrevious(current, previous);
      expect(cmp.regressions).toContain("unit-key");
    });

    it("detects new passes", () => {
      const previous = makeResult({
        passed: 2,
        failed: 1,
        overall_status: "fail",
        checks: [
          {
            id: "typecheck-frontend",
            name: "TypeScript Frontend",
            category: "typecheck",
            status: "pass",
            duration_ms: 1000,
            exit_code: 0,
          },
          {
            id: "lint",
            name: "ESLint",
            category: "lint",
            status: "pass",
            duration_ms: 500,
            exit_code: 0,
          },
          {
            id: "unit-key",
            name: "Key Unit Tests",
            category: "unit",
            status: "fail",
            duration_ms: 2000,
            exit_code: 1,
          },
        ],
      });
      const current = makeResult();
      const cmp = compareWithPrevious(current, previous);
      expect(cmp.new_passes).toContain("unit-key");
    });
  });
});
