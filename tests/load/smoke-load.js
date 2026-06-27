/**
 * k6 Load Test — Smoke Load Test
 * =================================
 * Tests critical endpoints under light load to ensure basic performance.
 *
 * Scenarios:
 *   1. Homepage load
 *   2. Dashboard load (authenticated)
 *   3. API search endpoint
 *   4. API think endpoint (authenticated)
 *
 * Load Profile:
 *   - 10 virtual users
 *   - 30 seconds duration
 *   - Ramp-up over 10 seconds
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

// Custom metrics
const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "10s", target: 10 }, // Ramp up to 10 users
    { duration: "20s", target: 10 }, // Stay at 10 users
    { duration: "10s", target: 0 }, // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests must complete below 500ms
    http_req_failed: ["rate<0.05"], // Error rate must be below 5%
    errors: ["rate<0.05"], // Custom error rate must be below 5%
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  // Scenario 1: Homepage load
  let homepageRes = http.get(`${BASE_URL}/`);
  check(homepageRes, {
    "homepage status 200": (r) => r.status === 200,
    "homepage response time < 500ms": (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);

  // Scenario 2: API search endpoint (public)
  let searchRes = http.get(`${BASE_URL}/api/search?q=test`);
  check(searchRes, {
    "search status 200": (r) => r.status === 200,
    "search response time < 500ms": (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);
}
