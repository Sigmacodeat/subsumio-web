/**
 * Load Test Scenarios & Performance Regression Gate — P0-PERF-002
 *
 * Definiert:
 *   1. LoadTestScenario — strukturierte Lasttest-Szenarien (Bulk-Upload,
 *      paralleles Review, SSE-Streams)
 *   2. k6-Szenario-Generator — generiert k6-kompatible JavaScript-Szenarien
 *   3. PerformanceRegressionGate — vergleicht aktuelle Messwerte gegen
 *      Baseline und blockiert bei Regression
 *   4. SLO-Durchsetzung — p95/p99/error_rate gegen API_SLOS aus P0-PERF-001
 */

import { API_SLOS } from "@/lib/performance-budgets";

// ── Types ─────────────────────────────────────────────────────────────

export type ScenarioType =
  | "bulk_upload"
  | "parallel_review"
  | "sse_streams"
  | "mixed_workload"
  | "spike"
  | "soak";

export interface LoadTestScenario {
  id: string;
  name: string;
  type: ScenarioType;
  description: string;
  target_url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Number of virtual users. */
  vus: number;
  /** Ramp-up time in seconds. */
  ramp_up_seconds: number;
  /** Steady-state duration in seconds. */
  duration_seconds: number;
  /** Ramp-down time in seconds. */
  ramp_down_seconds: number;
  /** Request body template (for POST/PUT). */
  body_template?: Record<string, unknown>;
  /** Headers to send. */
  headers?: Record<string, string>;
  /** Expected status codes. */
  expected_status: number[];
  /** SLO thresholds for this scenario. */
  slo: {
    p95_ms: number;
    p99_ms: number;
    error_rate: number;
  };
  /** Tags for filtering. */
  tags?: string[];
}

export interface LoadTestResult {
  scenario_id: string;
  timestamp: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  error_rate: number;
  requests_per_second: number;
  duration_seconds: number;
  passed: boolean;
  violations: string[];
}

export interface RegressionBaseline {
  route: string;
  method: string;
  p95_ms: number;
  p99_ms: number;
  error_rate: number;
  recorded_at: string;
}

export interface RegressionResult {
  total_routes: number;
  regressions: number;
  improvements: number;
  unchanged: number;
  details: Array<{
    route: string;
    method: string;
    metric: "p95" | "p99" | "error_rate";
    baseline: number;
    current: number;
    change_pct: number;
    is_regression: boolean;
  }>;
  gate_passed: boolean;
}

// ── Predefined Scenarios ──────────────────────────────────────────────

export const LOAD_TEST_SCENARIOS: LoadTestScenario[] = [
  {
    id: "bulk-upload-50",
    name: "Bulk Upload 50 Documents",
    type: "bulk_upload",
    description: "Upload 50 documents concurrently via API",
    target_url: "/api/upload",
    method: "POST",
    vus: 10,
    ramp_up_seconds: 5,
    duration_seconds: 60,
    ramp_down_seconds: 5,
    headers: { "Content-Type": "multipart/form-data" },
    expected_status: [200, 201],
    slo: { p95_ms: 5000, p99_ms: 10000, error_rate: 0.05 },
    tags: ["upload", "bulk", "p0"],
  },
  {
    id: "parallel-review-20",
    name: "Parallel Document Review 20 Users",
    type: "parallel_review",
    description: "20 users reviewing documents simultaneously",
    target_url: "/api/matter-context/[caseSlug]/documents",
    method: "GET",
    vus: 20,
    ramp_up_seconds: 10,
    duration_seconds: 120,
    ramp_down_seconds: 10,
    expected_status: [200],
    slo: { p95_ms: 2000, p99_ms: 4000, error_rate: 0.01 },
    tags: ["review", "parallel", "p0"],
  },
  {
    id: "sse-streams-100",
    name: "SSE Streams 100 Concurrent",
    type: "sse_streams",
    description: "100 concurrent SSE stream connections",
    target_url: "/api/events/stream",
    method: "GET",
    vus: 100,
    ramp_up_seconds: 15,
    duration_seconds: 180,
    ramp_down_seconds: 15,
    headers: { Accept: "text/event-stream" },
    expected_status: [200],
    slo: { p95_ms: 1000, p99_ms: 2000, error_rate: 0.02 },
    tags: ["sse", "streaming", "p0"],
  },
  {
    id: "mixed-workload-50",
    name: "Mixed Workload 50 Users",
    type: "mixed_workload",
    description: "50 users with mixed read/write/search operations",
    target_url: "/api/search",
    method: "POST",
    vus: 50,
    ramp_up_seconds: 10,
    duration_seconds: 300,
    ramp_down_seconds: 10,
    body_template: { query: "test query", mode: "hybrid" },
    headers: { "Content-Type": "application/json" },
    expected_status: [200],
    slo: { p95_ms: 3000, p99_ms: 6000, error_rate: 0.03 },
    tags: ["mixed", "search", "p0"],
  },
  {
    id: "spike-200",
    name: "Spike Test 200 Users",
    type: "spike",
    description: "Sudden spike to 200 users for 30 seconds",
    target_url: "/api/matter-context/[caseSlug]",
    method: "GET",
    vus: 200,
    ramp_up_seconds: 2,
    duration_seconds: 30,
    ramp_down_seconds: 5,
    expected_status: [200],
    slo: { p95_ms: 8000, p99_ms: 15000, error_rate: 0.1 },
    tags: ["spike", "p0"],
  },
  {
    id: "soak-10-1h",
    name: "Soak Test 10 Users 1 Hour",
    type: "soak",
    description: "10 users sustained load for 1 hour — detects memory leaks",
    target_url: "/api/search",
    method: "POST",
    vus: 10,
    ramp_up_seconds: 10,
    duration_seconds: 3600,
    ramp_down_seconds: 10,
    body_template: { query: "soak test", mode: "hybrid" },
    headers: { "Content-Type": "application/json" },
    expected_status: [200],
    slo: { p95_ms: 3000, p99_ms: 5000, error_rate: 0.02 },
    tags: ["soak", "endurance", "p0"],
  },
];

// ── k6 Scenario Generator ─────────────────────────────────────────────

/**
 * Generate a k6-compatible JavaScript scenario string from a LoadTestScenario.
 */
export function generateK6Script(scenario: LoadTestScenario): string {
  const bodyStr = scenario.body_template ? JSON.stringify(scenario.body_template) : "null";
  const headersStr = scenario.headers ? JSON.stringify(scenario.headers, null, 2) : "{}";

  return `import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const duration = new Trend('request_duration');

export const options = {
  scenarios: {
    ${scenario.id}: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '${scenario.ramp_up_seconds}s', target: ${scenario.vus} },
        { duration: '${scenario.duration_seconds}s', target: ${scenario.vus} },
        { duration: '${scenario.ramp_down_seconds}s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<${scenario.slo.p95_ms}', 'p(99)<${scenario.slo.p99_ms}'],
    'errors': ['rate<${scenario.slo.error_rate}'],
  },
};

export default function () {
  const params = {
    headers: ${headersStr},
    timeout: '30s',
  };

  const res = http.${scenario.method.toLowerCase()}('${scenario.target_url}', ${bodyStr}, params);

  check(res, {
    'status is expected': (r) => [${scenario.expected_status.join(", ")}].includes(r.status),
  });

  errorRate.add(res.status >= 400);
  duration.add(res.timings.duration);

  sleep(0.5);
}
`;
}

/**
 * Generate k6 scripts for all predefined scenarios.
 */
export function generateAllK6Scripts(): Record<string, string> {
  const scripts: Record<string, string> = {};
  for (const scenario of LOAD_TEST_SCENARIOS) {
    scripts[scenario.id] = generateK6Script(scenario);
  }
  return scripts;
}

// ── Performance Regression Gate ───────────────────────────────────────

export interface RegressionGateConfig {
  /** Maximum allowed p95 regression in percent. */
  max_p95_regression_pct: number;
  /** Maximum allowed p99 regression in percent. */
  max_p99_regression_pct: number;
  /** Maximum allowed error rate regression in percent. */
  max_error_rate_regression_pct: number;
  /** Minimum requests for a valid measurement. */
  min_requests: number;
}

export const DEFAULT_REGRESSION_CONFIG: RegressionGateConfig = {
  max_p95_regression_pct: 15,
  max_p99_regression_pct: 20,
  max_error_rate_regression_pct: 50,
  min_requests: 100,
};

/**
 * Evaluate a load test result against its scenario SLO.
 */
export function evaluateScenarioResult(
  scenario: LoadTestScenario,
  result: LoadTestResult
): { passed: boolean; violations: string[] } {
  const violations: string[] = [];

  if (result.p95_ms > scenario.slo.p95_ms) {
    violations.push(`p95 ${result.p95_ms}ms exceeds SLO ${scenario.slo.p95_ms}ms`);
  }
  if (result.p99_ms > scenario.slo.p99_ms) {
    violations.push(`p99 ${result.p99_ms}ms exceeds SLO ${scenario.slo.p99_ms}ms`);
  }
  if (result.error_rate > scenario.slo.error_rate) {
    violations.push(
      `error_rate ${(result.error_rate * 100).toFixed(2)}% exceeds SLO ${(scenario.slo.error_rate * 100).toFixed(2)}%`
    );
  }
  if (result.total_requests < 1) {
    violations.push("No requests were made");
  }

  return { passed: violations.length === 0, violations };
}

/**
 * Compare current results against a baseline and detect regressions.
 */
export function detectRegressions(
  baseline: RegressionBaseline[],
  current: Array<{
    route: string;
    method: string;
    p95_ms: number;
    p99_ms: number;
    error_rate: number;
  }>,
  config: RegressionGateConfig = DEFAULT_REGRESSION_CONFIG
): RegressionResult {
  const details: RegressionResult["details"] = [];
  let regressions = 0;
  let improvements = 0;
  let unchanged = 0;

  for (const current_ of current) {
    const base = baseline.find((b) => b.route === current_.route && b.method === current_.method);
    if (!base) continue;

    // p95 regression
    const p95ChangePct = ((current_.p95_ms - base.p95_ms) / base.p95_ms) * 100;
    if (Math.abs(p95ChangePct) > 1) {
      const isRegression = p95ChangePct > config.max_p95_regression_pct;
      details.push({
        route: current_.route,
        method: current_.method,
        metric: "p95",
        baseline: base.p95_ms,
        current: current_.p95_ms,
        change_pct: p95ChangePct,
        is_regression: isRegression,
      });
      if (isRegression) regressions++;
      else if (p95ChangePct < -config.max_p95_regression_pct) improvements++;
      else unchanged++;
    }

    // p99 regression
    const p99ChangePct = ((current_.p99_ms - base.p99_ms) / base.p99_ms) * 100;
    if (Math.abs(p99ChangePct) > 1) {
      const isRegression = p99ChangePct > config.max_p99_regression_pct;
      details.push({
        route: current_.route,
        method: current_.method,
        metric: "p99",
        baseline: base.p99_ms,
        current: current_.p99_ms,
        change_pct: p99ChangePct,
        is_regression: isRegression,
      });
      if (isRegression) regressions++;
      else if (p99ChangePct < -config.max_p99_regression_pct) improvements++;
      else unchanged++;
    }

    // error rate regression
    const errorChangePct =
      base.error_rate > 0 ? ((current_.error_rate - base.error_rate) / base.error_rate) * 100 : 0;
    if (Math.abs(errorChangePct) > 1) {
      const isRegression = errorChangePct > config.max_error_rate_regression_pct;
      details.push({
        route: current_.route,
        method: current_.method,
        metric: "error_rate",
        baseline: base.error_rate,
        current: current_.error_rate,
        change_pct: errorChangePct,
        is_regression: isRegression,
      });
      if (isRegression) regressions++;
      else if (errorChangePct < -config.max_error_rate_regression_pct) improvements++;
      else unchanged++;
    }
  }

  return {
    total_routes: current.length,
    regressions,
    improvements,
    unchanged,
    details,
    gate_passed: regressions === 0,
  };
}

/**
 * Check SLO compliance for all API routes.
 */
export function checkSloCompliance(
  measurements: Array<{
    route: string;
    method: string;
    p95_ms: number;
    p99_ms: number;
    error_rate: number;
  }>
): { compliant: boolean; violations: string[]; checked: number } {
  const violations: string[] = [];
  let checked = 0;

  for (const m of measurements) {
    const slo = API_SLOS.find((s) => s.route === m.route && s.method === m.method);
    if (!slo) continue;

    checked++;

    if (m.p95_ms > slo.p95_target_ms) {
      violations.push(`${m.method} ${m.route}: p95 ${m.p95_ms}ms > target ${slo.p95_target_ms}ms`);
    }
    if (m.p99_ms > slo.p99_target_ms) {
      violations.push(`${m.method} ${m.route}: p99 ${m.p99_ms}ms > target ${slo.p99_target_ms}ms`);
    }
    if (m.error_rate > slo.error_rate_target) {
      violations.push(
        `${m.method} ${m.route}: error_rate ${(m.error_rate * 100).toFixed(2)}% > max ${(slo.error_rate_target * 100).toFixed(2)}%`
      );
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    checked,
  };
}

/**
 * Create a load test result from raw metrics.
 */
export function createLoadTestResult(
  scenarioId: string,
  metrics: {
    total_requests: number;
    successful: number;
    failed: number;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    avg_ms: number;
    min_ms: number;
    max_ms: number;
    duration_seconds: number;
  }
): LoadTestResult {
  const errorRate = metrics.total_requests > 0 ? metrics.failed / metrics.total_requests : 1;
  const rps = metrics.duration_seconds > 0 ? metrics.total_requests / metrics.duration_seconds : 0;

  const scenario = LOAD_TEST_SCENARIOS.find((s) => s.id === scenarioId);
  let violations: string[] = [];
  let passed = true;

  if (scenario) {
    const eval_ = evaluateScenarioResult(scenario, {
      scenario_id: scenarioId,
      timestamp: new Date().toISOString(),
      total_requests: metrics.total_requests,
      successful_requests: metrics.successful,
      failed_requests: metrics.failed,
      p50_ms: metrics.p50_ms,
      p95_ms: metrics.p95_ms,
      p99_ms: metrics.p99_ms,
      avg_ms: metrics.avg_ms,
      min_ms: metrics.min_ms,
      max_ms: metrics.max_ms,
      error_rate: errorRate,
      requests_per_second: rps,
      duration_seconds: metrics.duration_seconds,
      passed: true,
      violations: [],
    });
    passed = eval_.passed;
    violations = eval_.violations;
  }

  return {
    scenario_id: scenarioId,
    timestamp: new Date().toISOString(),
    total_requests: metrics.total_requests,
    successful_requests: metrics.successful,
    failed_requests: metrics.failed,
    p50_ms: metrics.p50_ms,
    p95_ms: metrics.p95_ms,
    p99_ms: metrics.p99_ms,
    avg_ms: metrics.avg_ms,
    min_ms: metrics.min_ms,
    max_ms: metrics.max_ms,
    error_rate: errorRate,
    requests_per_second: rps,
    duration_seconds: metrics.duration_seconds,
    passed,
    violations,
  };
}
