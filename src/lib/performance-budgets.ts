/**
 * Performance Budgets & SLOs — P0-PERF-001 + P0-PERF-002.
 *
 * Definiert Core Web Vitals Budgets, API-p95-SLOs pro kritischer Route,
 * und Load-Test-Szenarien für k6/Artillery.
 */

// ── Core Web Vitals Budgets ───────────────────────────────────────────

export interface CoreWebVitalsBudget {
  metric: "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
  target: number;
  unit: "ms" | "score";
  threshold_degraded: number;
  threshold_poor: number;
}

export const CWV_BUDGETS: CoreWebVitalsBudget[] = [
  { metric: "LCP", target: 2500, unit: "ms", threshold_degraded: 4000, threshold_poor: 6000 },
  { metric: "INP", target: 200, unit: "ms", threshold_degraded: 500, threshold_poor: 800 },
  { metric: "CLS", target: 0.1, unit: "score", threshold_degraded: 0.25, threshold_poor: 0.5 },
  { metric: "FCP", target: 1800, unit: "ms", threshold_degraded: 3000, threshold_poor: 5000 },
  { metric: "TTFB", target: 800, unit: "ms", threshold_degraded: 1800, threshold_poor: 3000 },
];

export type CwvStatus = "good" | "degraded" | "poor";

export function evaluateCwv(metric: CoreWebVitalsBudget["metric"], value: number): CwvStatus {
  const budget = CWV_BUDGETS.find((b) => b.metric === metric);
  if (!budget) return "poor";
  if (value <= budget.target) return "good";
  if (value <= budget.threshold_degraded) return "degraded";
  return "poor";
}

// ── API p95 SLOs ──────────────────────────────────────────────────────

export interface ApiSloEntry {
  route: string;
  method: string;
  p95_target_ms: number;
  p99_target_ms: number;
  error_rate_target: number;
  category: "critical" | "important" | "standard";
  description: string;
}

export const API_SLOS: ApiSloEntry[] = [
  // Critical routes
  { route: "/api/think", method: "POST", p95_target_ms: 5000, p99_target_ms: 10000, error_rate_target: 0.01, category: "critical", description: "AI Query — Brain Think" },
  { route: "/api/search", method: "POST", p95_target_ms: 2000, p99_target_ms: 5000, error_rate_target: 0.01, category: "critical", description: "Brain Search" },
  { route: "/api/matter-context/[caseSlug]", method: "GET", p95_target_ms: 1500, p99_target_ms: 3000, error_rate_target: 0.005, category: "critical", description: "Matter Context Bundle" },
  { route: "/api/pages/[slug]", method: "GET", p95_target_ms: 500, p99_target_ms: 1500, error_rate_target: 0.005, category: "critical", description: "Brain Page Fetch" },

  // Important routes
  { route: "/api/time", method: "GET", p95_target_ms: 1000, p99_target_ms: 2000, error_rate_target: 0.01, category: "important", description: "Time Tracking List" },
  { route: "/api/time", method: "POST", p95_target_ms: 1000, p99_target_ms: 2000, error_rate_target: 0.01, category: "important", description: "Time Entry Create" },
  { route: "/api/time/billing-summary", method: "GET", p95_target_ms: 2000, p99_target_ms: 5000, error_rate_target: 0.01, category: "important", description: "Billing Summary" },
  { route: "/api/dashboard/stats", method: "GET", p95_target_ms: 1000, p99_target_ms: 2000, error_rate_target: 0.01, category: "important", description: "Dashboard Stats" },
  { route: "/api/deadlines", method: "GET", p95_target_ms: 1000, p99_target_ms: 2000, error_rate_target: 0.01, category: "important", description: "Deadlines List" },
  { route: "/api/invoices", method: "GET", p95_target_ms: 1500, p99_target_ms: 3000, error_rate_target: 0.01, category: "important", description: "Invoices List" },
  { route: "/api/invoices", method: "POST", p95_target_ms: 2000, p99_target_ms: 5000, error_rate_target: 0.01, category: "important", description: "Invoice Create" },

  // Standard routes
  { route: "/api/realtime/sse", method: "GET", p95_target_ms: 100, p99_target_ms: 500, error_rate_target: 0.005, category: "standard", description: "SSE Stream (connection time)" },
  { route: "/api/settings", method: "GET", p95_target_ms: 500, p99_target_ms: 1000, error_rate_target: 0.01, category: "standard", description: "Settings Read" },
  { route: "/api/connectors", method: "GET", p95_target_ms: 500, p99_target_ms: 1000, error_rate_target: 0.01, category: "standard", description: "Connectors List" },
];

export function getSloForRoute(route: string, method: string): ApiSloEntry | undefined {
  return API_SLOS.find((s) => s.route === route && s.method === method);
}

export function evaluateSlo(route: string, method: string, p95Ms: number, errorRate: number): {
  passed: boolean;
  violations: string[];
  slo: ApiSloEntry | undefined;
} {
  const slo = getSloForRoute(route, method);
  if (!slo) {
    return { passed: true, violations: [], slo: undefined };
  }

  const violations: string[] = [];
  if (p95Ms > slo.p95_target_ms) {
    violations.push(`p95 ${p95Ms}ms exceeds target ${slo.p95_target_ms}ms`);
  }
  if (errorRate > slo.error_rate_target) {
    violations.push(`error rate ${(errorRate * 100).toFixed(2)}% exceeds target ${(slo.error_rate_target * 100).toFixed(2)}%`);
  }

  return { passed: violations.length === 0, violations, slo };
}

// ── Performance Regression Gate ───────────────────────────────────────

export interface PerfRegressionResult {
  passed: boolean;
  regressions: PerfRegression[];
  new_baselines: PerfBaseline[];
}

export interface PerfRegression {
  route: string;
  method: string;
  metric: "p95" | "p99" | "error_rate";
  baseline: number;
  current: number;
  regression_pct: number;
  threshold_pct: number;
}

export interface PerfBaseline {
  route: string;
  method: string;
  p95_ms: number;
  p99_ms: number;
  error_rate: number;
  recorded_at: string;
}

const REGRESSION_THRESHOLD_PCT = 0.15;

export function checkPerfRegression(
  baselines: PerfBaseline[],
  current: PerfBaseline[],
  thresholdPct: number = REGRESSION_THRESHOLD_PCT,
): PerfRegressionResult {
  const regressions: PerfRegression[] = [];
  const newBaselines: PerfBaseline[] = [];

  for (const current_ of current) {
    const baseline = baselines.find(
      (b) => b.route === current_.route && b.method === current_.method,
    );

    if (!baseline) {
      newBaselines.push(current_);
      continue;
    }

    const p95Regression = (current_.p95_ms - baseline.p95_ms) / baseline.p95_ms;
    if (p95Regression > thresholdPct) {
      regressions.push({
        route: current_.route,
        method: current_.method,
        metric: "p95",
        baseline: baseline.p95_ms,
        current: current_.p95_ms,
        regression_pct: p95Regression,
        threshold_pct: thresholdPct,
      });
    }

    const p99Regression = (current_.p99_ms - baseline.p99_ms) / baseline.p99_ms;
    if (p99Regression > thresholdPct) {
      regressions.push({
        route: current_.route,
        method: current_.method,
        metric: "p99",
        baseline: baseline.p99_ms,
        current: current_.p99_ms,
        regression_pct: p99Regression,
        threshold_pct: thresholdPct,
      });
    }

    const errorRegression = baseline.error_rate > 0
      ? (current_.error_rate - baseline.error_rate) / baseline.error_rate
      : 0;
    if (errorRegression > thresholdPct && current_.error_rate > 0.01) {
      regressions.push({
        route: current_.route,
        method: current_.method,
        metric: "error_rate",
        baseline: baseline.error_rate,
        current: current_.error_rate,
        regression_pct: errorRegression,
        threshold_pct: thresholdPct,
      });
    }
  }

  return {
    passed: regressions.length === 0,
    regressions,
    new_baselines: newBaselines,
  };
}

// ── Load Test Scenarios ───────────────────────────────────────────────

export interface LoadTestScenario {
  id: string;
  name: string;
  description: string;
  tool: "k6" | "artillery";
  target_route: string;
  method: string;
  virtual_users: number;
  duration_seconds: number;
  ramp_up_seconds: number;
  expected_p95_ms: number;
  expected_error_rate: number;
  payload_template?: string;
  tags: string[];
}

export const LOAD_TEST_SCENARIOS: LoadTestScenario[] = [
  {
    id: "bulk-upload",
    name: "Bulk Document Upload",
    description: "Simuliert parallelen Upload von 50 Dokumenten durch 10 User",
    tool: "k6",
    target_route: "/api/upload",
    method: "POST",
    virtual_users: 10,
    duration_seconds: 120,
    ramp_up_seconds: 10,
    expected_p95_ms: 5000,
    expected_error_rate: 0.02,
    payload_template: "{ file: binary, case_slug: string }",
    tags: ["upload", "bulk", "dms"],
  },
  {
    id: "parallel-review",
    name: "Parallel Document Review",
    description: "Simuliert parallele AI-Dokumentenprüfung durch 5 Anwälte",
    tool: "k6",
    target_route: "/api/think",
    method: "POST",
    virtual_users: 5,
    duration_seconds: 300,
    ramp_up_seconds: 30,
    expected_p95_ms: 8000,
    expected_error_rate: 0.01,
    payload_template: "{ query: string, case_slug: string, mode: 'document_review' }",
    tags: ["ai", "review", "parallel"],
  },
  {
    id: "sse-streams",
    name: "SSE Stream Stability",
    description: "Simuliert 50 gleichzeitige SSE-Verbindungen über 5 Minuten",
    tool: "k6",
    target_route: "/api/realtime/sse",
    method: "GET",
    virtual_users: 50,
    duration_seconds: 300,
    ramp_up_seconds: 20,
    expected_p95_ms: 100,
    expected_error_rate: 0.005,
    tags: ["sse", "realtime", "connections"],
  },
  {
    id: "search-burst",
    name: "Search Burst Load",
    description: "Simuliert 20 gleichzeitige Suchanfragen bei Aktenöffnung",
    tool: "k6",
    target_route: "/api/search",
    method: "POST",
    virtual_users: 20,
    duration_seconds: 60,
    ramp_up_seconds: 5,
    expected_p95_ms: 3000,
    expected_error_rate: 0.01,
    payload_template: "{ query: string, mode: 'balanced' }",
    tags: ["search", "burst"],
  },
  {
    id: "matter-context-load",
    name: "Matter Context Bundle Load",
    description: "Simuliert 10 Anwälte, die gleichzeitig Akten-Kontext abrufen",
    tool: "k6",
    target_route: "/api/matter-context/[caseSlug]",
    method: "GET",
    virtual_users: 10,
    duration_seconds: 120,
    ramp_up_seconds: 10,
    expected_p95_ms: 2000,
    expected_error_rate: 0.005,
    tags: ["matter-context", "bundle", "concurrent"],
  },
  {
    id: "invoice-generation",
    name: "Invoice Generation Burst",
    description: "Simuliert Monatsabschluss mit 5 gleichzeitigen Rechnungserstellungen",
    tool: "k6",
    target_route: "/api/invoices",
    method: "POST",
    virtual_users: 5,
    duration_seconds: 180,
    ramp_up_seconds: 15,
    expected_p95_ms: 5000,
    expected_error_rate: 0.01,
    payload_template: "{ case_slug: string, time_entry_ids: string[] }",
    tags: ["invoice", "billing", "month-end"],
  },
];

export function getScenarioForRoute(route: string): LoadTestScenario[] {
  return LOAD_TEST_SCENARIOS.filter((s) => s.target_route === route);
}

export function exportK6Script(scenario: LoadTestScenario): string {
  return `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: ${scenario.virtual_users},
  duration: '${scenario.duration_seconds}s',
  stages: [
    { duration: '${scenario.ramp_up_seconds}s', target: ${scenario.virtual_users} },
    { duration: '${scenario.duration_seconds - scenario.ramp_up_seconds}s', target: ${scenario.virtual_users} },
  ],
  thresholds: {
    http_req_duration: ['p(95)<${scenario.expected_p95_ms}'],
    http_req_failed: ['rate<${scenario.expected_error_rate}'],
  },
};

export default function () {
  const url = '${scenario.target_route}';
  ${scenario.method === "GET"
    ? `const res = http.get(url);`
    : `const payload = ${scenario.payload_template || "{}"};
  const res = http.post(url, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });`}
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < ${scenario.expected_p95_ms}ms': (r) => r.timings.duration < ${scenario.expected_p95_ms},
  });
  sleep(1);
}`;
}
