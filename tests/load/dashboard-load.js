/**
 * k6 Load Test — Dashboard Load Test
 * =================================
 * Tests dashboard endpoints under moderate load.
 *
 * Scenarios:
 *   1. Dashboard page load (authenticated)
 *   2. Cases list load
 *   3. Deadlines load
 *   4. Brain query (think endpoint)
 *
 * Load Profile:
 *   - 50 virtual users
 *   - 60 seconds duration
 *   - Ramp-up over 20 seconds
 *
 * Note: Requires valid authentication token via AUTH_TOKEN environment variable.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "20s", target: 50 }, // Ramp up to 50 users
    { duration: "40s", target: 50 }, // Stay at 50 users
    { duration: "20s", target: 0 }, // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ["p(95)<1000"], // 95% of requests must complete below 1s
    http_req_failed: ["rate<0.05"], // Error rate must be below 5%
    errors: ["rate<0.05"], // Custom error rate must be below 5%
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

export default function () {
  if (!AUTH_TOKEN) {
    console.error("AUTH_TOKEN environment variable is required");
    return;
  }

  const headers = {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    "Content-Type": "application/json",
  };

  // Scenario 1: Dashboard page load
  let dashboardRes = http.get(`${BASE_URL}/dashboard`, { headers });
  check(dashboardRes, {
    "dashboard status 200": (r) => r.status === 200,
    "dashboard response time < 1s": (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  sleep(1);

  // Scenario 2: Cases list load
  let casesRes = http.get(`${BASE_URL}/api/pages?type=legal_case`, { headers });
  check(casesRes, {
    "cases status 200": (r) => r.status === 200,
    "cases response time < 1s": (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  sleep(1);

  // Scenario 3: Deadlines load
  let deadlinesRes = http.get(`${BASE_URL}/api/deadlines`, { headers });
  check(deadlinesRes, {
    "deadlines status 200": (r) => r.status === 200,
    "deadlines response time < 1s": (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  sleep(1);

  // Scenario 4: Brain query (think endpoint)
  let thinkRes = http.post(
    `${BASE_URL}/api/think`,
    JSON.stringify({ query: "Was ist ein Lieferverzug?", mode: "balanced" }),
    { headers }
  );
  check(thinkRes, {
    "think status 200": (r) => r.status === 200,
    "think response time < 5s": (r) => r.timings.duration < 5000,
  }) || errorRate.add(1);

  sleep(2);
}
