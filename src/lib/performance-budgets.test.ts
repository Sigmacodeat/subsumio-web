// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  CWV_BUDGETS,
  evaluateCwv,
  API_SLOS,
  getSloForRoute,
  evaluateSlo,
  checkPerfRegression,
  LOAD_TEST_SCENARIOS,
  getScenarioForRoute,
  exportK6Script,
  type PerfBaseline,
} from "@/lib/performance-budgets";

describe("CWV_BUDGETS", () => {
  test("includes all 5 Core Web Vitals", () => {
    const metrics = CWV_BUDGETS.map((b) => b.metric);
    expect(metrics).toContain("LCP");
    expect(metrics).toContain("INP");
    expect(metrics).toContain("CLS");
    expect(metrics).toContain("FCP");
    expect(metrics).toContain("TTFB");
  });
});

describe("evaluateCwv", () => {
  test("LCP at target → good", () => {
    expect(evaluateCwv("LCP", 2500)).toBe("good");
  });

  test("LCP degraded → degraded", () => {
    expect(evaluateCwv("LCP", 3500)).toBe("degraded");
  });

  test("LCP poor → poor", () => {
    expect(evaluateCwv("LCP", 5000)).toBe("poor");
  });

  test("CLS at target → good", () => {
    expect(evaluateCwv("CLS", 0.1)).toBe("good");
  });

  test("CLS poor → poor", () => {
    expect(evaluateCwv("CLS", 0.4)).toBe("poor");
  });

  test("unknown metric → poor", () => {
    expect(evaluateCwv("UNKNOWN" as never, 100)).toBe("poor");
  });
});

describe("API_SLOS", () => {
  test("includes critical routes", () => {
    expect(API_SLOS.some((s) => s.route === "/api/think")).toBe(true);
    expect(API_SLOS.some((s) => s.route === "/api/search")).toBe(true);
    expect(API_SLOS.some((s) => s.route === "/api/matter-context/[caseSlug]")).toBe(true);
  });

  test("all entries have valid targets", () => {
    for (const slo of API_SLOS) {
      expect(slo.p95_target_ms).toBeGreaterThan(0);
      expect(slo.p99_target_ms).toBeGreaterThanOrEqual(slo.p95_target_ms);
      expect(slo.error_rate_target).toBeGreaterThan(0);
      expect(slo.error_rate_target).toBeLessThan(1);
    }
  });
});

describe("getSloForRoute", () => {
  test("finds existing route", () => {
    const slo = getSloForRoute("/api/think", "POST");
    expect(slo).toBeDefined();
    expect(slo?.category).toBe("critical");
  });

  test("returns undefined for unknown route", () => {
    expect(getSloForRoute("/api/unknown", "GET")).toBeUndefined();
  });
});

describe("evaluateSlo", () => {
  test("within targets → passed", () => {
    const result = evaluateSlo("/api/think", "POST", 3000, 0.005);
    expect(result.passed).toBe(true);
  });

  test("exceeds p95 → violation", () => {
    const result = evaluateSlo("/api/think", "POST", 6000, 0.005);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("p95"))).toBe(true);
  });

  test("exceeds error rate → violation", () => {
    const result = evaluateSlo("/api/think", "POST", 3000, 0.05);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("error rate"))).toBe(true);
  });

  test("unknown route → passed (no SLO defined)", () => {
    const result = evaluateSlo("/api/unknown", "GET", 10000, 0.5);
    expect(result.passed).toBe(true);
  });
});

describe("checkPerfRegression", () => {
  const baselines: PerfBaseline[] = [
    { route: "/api/search", method: "POST", p95_ms: 1500, p99_ms: 3000, error_rate: 0.005, recorded_at: "2026-01-01" },
    { route: "/api/think", method: "POST", p95_ms: 4000, p99_ms: 8000, error_rate: 0.008, recorded_at: "2026-01-01" },
  ];

  test("no regression → passed", () => {
    const current: PerfBaseline[] = [
      { route: "/api/search", method: "POST", p95_ms: 1600, p99_ms: 3100, error_rate: 0.006, recorded_at: "2026-02-01" },
      { route: "/api/think", method: "POST", p95_ms: 4200, p99_ms: 8200, error_rate: 0.009, recorded_at: "2026-02-01" },
    ];
    const result = checkPerfRegression(baselines, current);
    expect(result.passed).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });

  test("p95 regression detected", () => {
    const current: PerfBaseline[] = [
      { route: "/api/search", method: "POST", p95_ms: 2000, p99_ms: 3000, error_rate: 0.005, recorded_at: "2026-02-01" },
    ];
    const result = checkPerfRegression(baselines, current);
    expect(result.passed).toBe(false);
    expect(result.regressions.some((r) => r.metric === "p95")).toBe(true);
  });

  test("p99 regression detected", () => {
    const current: PerfBaseline[] = [
      { route: "/api/search", method: "POST", p95_ms: 1500, p99_ms: 4000, error_rate: 0.005, recorded_at: "2026-02-01" },
    ];
    const result = checkPerfRegression(baselines, current);
    expect(result.passed).toBe(false);
    expect(result.regressions.some((r) => r.metric === "p99")).toBe(true);
  });

  test("new route → new baseline", () => {
    const current: PerfBaseline[] = [
      { route: "/api/new", method: "GET", p95_ms: 500, p99_ms: 1000, error_rate: 0.01, recorded_at: "2026-02-01" },
    ];
    const result = checkPerfRegression(baselines, current);
    expect(result.new_baselines).toHaveLength(1);
    expect(result.new_baselines[0].route).toBe("/api/new");
  });
});

describe("LOAD_TEST_SCENARIOS", () => {
  test("includes bulk-upload scenario", () => {
    expect(LOAD_TEST_SCENARIOS.some((s) => s.id === "bulk-upload")).toBe(true);
  });

  test("includes sse-streams scenario", () => {
    expect(LOAD_TEST_SCENARIOS.some((s) => s.id === "sse-streams")).toBe(true);
  });

  test("includes parallel-review scenario", () => {
    expect(LOAD_TEST_SCENARIOS.some((s) => s.id === "parallel-review")).toBe(true);
  });

  test("all scenarios have valid VUs and duration", () => {
    for (const s of LOAD_TEST_SCENARIOS) {
      expect(s.virtual_users).toBeGreaterThan(0);
      expect(s.duration_seconds).toBeGreaterThan(0);
      expect(s.expected_p95_ms).toBeGreaterThan(0);
    }
  });
});

describe("getScenarioForRoute", () => {
  test("finds scenarios for route", () => {
    const scenarios = getScenarioForRoute("/api/search");
    expect(scenarios.length).toBeGreaterThan(0);
  });

  test("returns empty for unknown route", () => {
    expect(getScenarioForRoute("/api/unknown")).toHaveLength(0);
  });
});

describe("exportK6Script", () => {
  test("generates valid k6 script for GET", () => {
    const scenario = LOAD_TEST_SCENARIOS.find((s) => s.method === "GET")!;
    const script = exportK6Script(scenario);
    expect(script).toContain("k6/http");
    expect(script).toContain("http.get");
  });

  test("generates valid k6 script for POST", () => {
    const scenario = LOAD_TEST_SCENARIOS.find((s) => s.method === "POST")!;
    const script = exportK6Script(scenario);
    expect(script).toContain("k6/http");
    expect(script).toContain("http.post");
  });

  test("includes thresholds", () => {
    const script = exportK6Script(LOAD_TEST_SCENARIOS[0]);
    expect(script).toContain("thresholds");
    expect(script).toContain("p(95)");
  });
});
