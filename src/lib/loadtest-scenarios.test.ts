/**
 * Load Test Scenarios & Performance Regression Gate Tests — P0-PERF-002
 */

import { describe, it, expect } from "vitest";
import {
  LOAD_TEST_SCENARIOS,
  generateK6Script,
  generateAllK6Scripts,
  evaluateScenarioResult,
  detectRegressions,
  checkSloCompliance,
  createLoadTestResult,
  DEFAULT_REGRESSION_CONFIG,
  type LoadTestResult,
  type RegressionBaseline,
} from "@/lib/loadtest-scenarios";

// ── 1. Predefined Scenarios ───────────────────────────────────────────

describe("LOAD_TEST_SCENARIOS", () => {
  it("defines at least 6 scenarios", () => {
    expect(LOAD_TEST_SCENARIOS.length).toBeGreaterThanOrEqual(6);
  });

  it("includes bulk_upload scenario", () => {
    expect(LOAD_TEST_SCENARIOS.some((s) => s.type === "bulk_upload")).toBe(true);
  });

  it("includes parallel_review scenario", () => {
    expect(LOAD_TEST_SCENARIOS.some((s) => s.type === "parallel_review")).toBe(true);
  });

  it("includes sse_streams scenario", () => {
    expect(LOAD_TEST_SCENARIOS.some((s) => s.type === "sse_streams")).toBe(true);
  });

  it("all scenarios have SLO thresholds", () => {
    for (const s of LOAD_TEST_SCENARIOS) {
      expect(s.slo.p95_ms).toBeGreaterThan(0);
      expect(s.slo.p99_ms).toBeGreaterThan(0);
      expect(s.slo.error_rate).toBeGreaterThanOrEqual(0);
    }
  });

  it("all scenarios have unique IDs", () => {
    const ids = LOAD_TEST_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all scenarios have positive VUs", () => {
    for (const s of LOAD_TEST_SCENARIOS) {
      expect(s.vus).toBeGreaterThan(0);
    }
  });
});

// ── 2. k6 Script Generator ────────────────────────────────────────────

describe("generateK6Script", () => {
  it("generates valid k6 JavaScript", () => {
    const scenario = LOAD_TEST_SCENARIOS[0];
    const script = generateK6Script(scenario);
    expect(script).toContain("import http from 'k6/http'");
    expect(script).toContain("export const options");
    expect(script).toContain("export default function");
  });

  it("includes scenario ID in stages", () => {
    const scenario = LOAD_TEST_SCENARIOS[0];
    const script = generateK6Script(scenario);
    expect(script).toContain(scenario.id);
  });

  it("includes SLO thresholds", () => {
    const scenario = LOAD_TEST_SCENARIOS[0];
    const script = generateK6Script(scenario);
    expect(script).toContain(`p(95)<${scenario.slo.p95_ms}`);
    expect(script).toContain(`p(99)<${scenario.slo.p99_ms}`);
  });

  it("includes correct HTTP method", () => {
    const postScenario = LOAD_TEST_SCENARIOS.find((s) => s.method === "POST")!;
    const script = generateK6Script(postScenario);
    expect(script).toContain("http.post");
  });

  it("includes target URL", () => {
    const scenario = LOAD_TEST_SCENARIOS[0];
    const script = generateK6Script(scenario);
    expect(script).toContain(scenario.target_url);
  });

  it("includes expected status codes", () => {
    const scenario = LOAD_TEST_SCENARIOS[0];
    const script = generateK6Script(scenario);
    expect(script).toContain(String(scenario.expected_status[0]));
  });
});

describe("generateAllK6Scripts", () => {
  it("generates scripts for all scenarios", () => {
    const scripts = generateAllK6Scripts();
    expect(Object.keys(scripts).length).toBe(LOAD_TEST_SCENARIOS.length);
  });

  it("each script is non-empty", () => {
    const scripts = generateAllK6Scripts();
    for (const [, script] of Object.entries(scripts)) {
      expect(script.length).toBeGreaterThan(100);
    }
  });
});

// ── 3. Scenario Result Evaluation ─────────────────────────────────────

describe("evaluateScenarioResult", () => {
  const scenario = LOAD_TEST_SCENARIOS[0];

  it("passes when all metrics within SLO", () => {
    const result: LoadTestResult = {
      scenario_id: scenario.id,
      timestamp: new Date().toISOString(),
      total_requests: 1000,
      successful_requests: 1000,
      failed_requests: 0,
      p50_ms: 500,
      p95_ms: 3000,
      p99_ms: 8000,
      avg_ms: 600,
      min_ms: 100,
      max_ms: 9000,
      error_rate: 0.01,
      requests_per_second: 16.7,
      duration_seconds: 60,
      passed: true,
      violations: [],
    };
    const eval_ = evaluateScenarioResult(scenario, result);
    expect(eval_.passed).toBe(true);
    expect(eval_.violations).toHaveLength(0);
  });

  it("fails when p95 exceeds SLO", () => {
    const result: LoadTestResult = {
      scenario_id: scenario.id,
      timestamp: new Date().toISOString(),
      total_requests: 1000,
      successful_requests: 900,
      failed_requests: 100,
      p50_ms: 500,
      p95_ms: 99999,
      p99_ms: 8000,
      avg_ms: 600,
      min_ms: 100,
      max_ms: 9000,
      error_rate: 0.01,
      requests_per_second: 16.7,
      duration_seconds: 60,
      passed: true,
      violations: [],
    };
    const eval_ = evaluateScenarioResult(scenario, result);
    expect(eval_.passed).toBe(false);
    expect(eval_.violations.some((v) => v.includes("p95"))).toBe(true);
  });

  it("fails when error rate exceeds SLO", () => {
    const result: LoadTestResult = {
      scenario_id: scenario.id,
      timestamp: new Date().toISOString(),
      total_requests: 1000,
      successful_requests: 500,
      failed_requests: 500,
      p50_ms: 500,
      p95_ms: 3000,
      p99_ms: 8000,
      avg_ms: 600,
      min_ms: 100,
      max_ms: 9000,
      error_rate: 0.5,
      requests_per_second: 16.7,
      duration_seconds: 60,
      passed: true,
      violations: [],
    };
    const eval_ = evaluateScenarioResult(scenario, result);
    expect(eval_.passed).toBe(false);
    expect(eval_.violations.some((v) => v.includes("error_rate"))).toBe(true);
  });
});

// ── 4. Regression Detection ───────────────────────────────────────────

describe("detectRegressions", () => {
  const baseline: RegressionBaseline[] = [
    {
      route: "/api/think",
      method: "POST",
      p95_ms: 3000,
      p99_ms: 5000,
      error_rate: 0.02,
      recorded_at: "2024-01-01T00:00:00Z",
    },
    {
      route: "/api/search",
      method: "POST",
      p95_ms: 2000,
      p99_ms: 4000,
      error_rate: 0.01,
      recorded_at: "2024-01-01T00:00:00Z",
    },
  ];

  it("detects no regression when metrics are same", () => {
    const current = [
      { route: "/api/think", method: "POST", p95_ms: 3000, p99_ms: 5000, error_rate: 0.02 },
      { route: "/api/search", method: "POST", p95_ms: 2000, p99_ms: 4000, error_rate: 0.01 },
    ];
    const result = detectRegressions(baseline, current);
    expect(result.gate_passed).toBe(true);
    expect(result.regressions).toBe(0);
  });

  it("detects p95 regression", () => {
    const current = [
      { route: "/api/think", method: "POST", p95_ms: 4000, p99_ms: 5000, error_rate: 0.02 },
    ];
    const result = detectRegressions(baseline, current);
    const p95Detail = result.details.find((d) => d.metric === "p95" && d.route === "/api/think");
    expect(p95Detail).toBeDefined();
    expect(p95Detail!.change_pct).toBeGreaterThan(0);
  });

  it("detects improvement (negative regression)", () => {
    const current = [
      { route: "/api/think", method: "POST", p95_ms: 2000, p99_ms: 5000, error_rate: 0.02 },
    ];
    const result = detectRegressions(baseline, current);
    expect(result.improvements).toBeGreaterThan(0);
  });

  it("gate fails when regression exceeds threshold", () => {
    const current = [
      { route: "/api/think", method: "POST", p95_ms: 5000, p99_ms: 8000, error_rate: 0.1 },
    ];
    const result = detectRegressions(baseline, current, DEFAULT_REGRESSION_CONFIG);
    expect(result.gate_passed).toBe(false);
    expect(result.regressions).toBeGreaterThan(0);
  });

  it("handles missing baseline gracefully", () => {
    const current = [
      { route: "/api/unknown", method: "GET", p95_ms: 1000, p99_ms: 2000, error_rate: 0.01 },
    ];
    const result = detectRegressions(baseline, current);
    expect(result.total_routes).toBe(1);
    expect(result.details).toHaveLength(0);
  });

  it("detects error rate regression", () => {
    const current = [
      { route: "/api/think", method: "POST", p95_ms: 3000, p99_ms: 5000, error_rate: 0.1 },
    ];
    const result = detectRegressions(baseline, current);
    const errorDetail = result.details.find((d) => d.metric === "error_rate");
    expect(errorDetail).toBeDefined();
    expect(errorDetail!.change_pct).toBeGreaterThan(0);
  });
});

// ── 5. SLO Compliance ─────────────────────────────────────────────────

describe("checkSloCompliance", () => {
  it("returns compliant when all within SLO", () => {
    const measurements = [
      { route: "/api/think", method: "POST", p95_ms: 2000, p99_ms: 4000, error_rate: 0.01 },
    ];
    const result = checkSloCompliance(measurements);
    expect(result.checked).toBeGreaterThan(0);
    expect(result.compliant).toBe(true);
  });

  it("returns violations when p95 exceeds", () => {
    const measurements = [
      { route: "/api/think", method: "POST", p95_ms: 99999, p99_ms: 4000, error_rate: 0.01 },
    ];
    const result = checkSloCompliance(measurements);
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.includes("p95"))).toBe(true);
  });

  it("skips routes not in SLO list", () => {
    const measurements = [
      { route: "/api/unknown", method: "GET", p95_ms: 99999, p99_ms: 99999, error_rate: 1 },
    ];
    const result = checkSloCompliance(measurements);
    expect(result.checked).toBe(0);
  });
});

// ── 6. createLoadTestResult ───────────────────────────────────────────

describe("createLoadTestResult", () => {
  it("creates a result with computed fields", () => {
    const result = createLoadTestResult("bulk-upload-50", {
      total_requests: 600,
      successful: 590,
      failed: 10,
      p50_ms: 500,
      p95_ms: 3000,
      p99_ms: 8000,
      avg_ms: 600,
      min_ms: 100,
      max_ms: 9000,
      duration_seconds: 60,
    });
    expect(result.total_requests).toBe(600);
    expect(result.error_rate).toBeCloseTo(10 / 600, 5);
    expect(result.requests_per_second).toBeCloseTo(10, 0);
  });

  it("evaluates against scenario SLO", () => {
    const result = createLoadTestResult("bulk-upload-50", {
      total_requests: 600,
      successful: 590,
      failed: 10,
      p50_ms: 500,
      p95_ms: 99999,
      p99_ms: 8000,
      avg_ms: 600,
      min_ms: 100,
      max_ms: 9000,
      duration_seconds: 60,
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("p95"))).toBe(true);
  });

  it("handles zero requests", () => {
    const result = createLoadTestResult("bulk-upload-50", {
      total_requests: 0,
      successful: 0,
      failed: 0,
      p50_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      avg_ms: 0,
      min_ms: 0,
      max_ms: 0,
      duration_seconds: 60,
    });
    expect(result.error_rate).toBe(1);
    expect(result.passed).toBe(false);
  });
});
