/**
 * k6 Load Test — Stress Load Test
 * =================================
 * Tests system under high load to identify breaking points.
 *
 * Scenarios:
 *   1. Homepage load
 *   2. API search endpoint
 *   3. API think endpoint (authenticated)
 *
 * Load Profile:
 *   - 200 virtual users peak
 *   - 120 seconds duration
 *   - Ramp-up over 30 seconds
 *
 * Note: Requires valid authentication token via AUTH_TOKEN environment variable.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '30s', target: 100 },  // Ramp up to 100 users
    { duration: '30s', target: 200 },  // Ramp up to 200 users (peak)
    { duration: '30s', target: 200 },  // Stay at 200 users
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.10'],     // Error rate must be below 10% (stress test)
    errors: ['rate<0.10'],              // Custom error rate must be below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export default function () {
  // Scenario 1: Homepage load (public)
  let homepageRes = http.get(`${BASE_URL}/`);
  check(homepageRes, {
    'homepage status 200': (r) => r.status === 200,
    'homepage response time < 2s': (r) => r.timings.duration < 2000,
  }) || errorRate.add(1);

  sleep(Math.random() * 2);

  // Scenario 2: API search endpoint (public)
  let searchRes = http.get(`${BASE_URL}/api/search?q=test`);
  check(searchRes, {
    'search status 200': (r) => r.status === 200,
    'search response time < 2s': (r) => r.timings.duration < 2000,
  }) || errorRate.add(1);

  sleep(Math.random() * 2);

  // Scenario 3: Brain query (think endpoint) - only if auth token provided
  if (AUTH_TOKEN) {
    const headers = {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    };
    let thinkRes = http.post(`${BASE_URL}/api/think`, 
      JSON.stringify({ query: 'Was ist ein Lieferverzug?', mode: 'balanced' }),
      { headers }
    );
    check(thinkRes, {
      'think status 200': (r) => r.status === 200,
      'think response time < 5s': (r) => r.timings.duration < 5000,
    }) || errorRate.add(1);
  }

  sleep(Math.random() * 2);
}
