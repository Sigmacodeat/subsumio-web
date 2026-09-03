/**
 * Load Test — Subsumio API
 * ========================
 *
 * Lightweight load test using Node's built-in http module (no external deps).
 * Runs against a local dev server (next dev) or staging.
 *
 * Usage:
 *   npm run dev  # in another terminal
 *   npx tsx scripts/load-test.ts
 *   npx tsx scripts/load-test.ts --url=http://localhost:3000 --duration=30 --concurrency=10
 *
 * Exit code 0 = all endpoints within p95 threshold
 * Exit code 1 = any endpoint exceeded p95 threshold
 *
 * CI integration: add to package.json scripts:
 *   "test:load": "npx tsx scripts/load-test.ts --duration=10 --concurrency=5"
 * And run after `npm run build && npm start` in CI.
 */

interface LoadTestConfig {
  url: string;
  duration: number; // seconds
  concurrency: number;
  p95ThresholdMs: number;
}

interface RequestResult {
  endpoint: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
}

const DEFAULT_CONFIG: LoadTestConfig = {
  url: process.env.LOAD_TEST_URL || "http://localhost:3000",
  duration: 10,
  concurrency: 5,
  p95ThresholdMs: 2000,
};

// Endpoints to load test — mix of read and write paths
const ENDPOINTS: Array<{ path: string; method: string; body?: unknown }> = [
  { path: "/api/health", method: "GET" },
  { path: "/", method: "GET" },
  { path: "/login", method: "GET" },
  { path: "/imprint", method: "GET" },
  { path: "/privacy", method: "GET" },
  { path: "/terms", method: "GET" },
  { path: "/dpa", method: "GET" },
];

function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    const [key, val] = arg.split("=");
    if (key === "--url") config.url = val;
    if (key === "--duration") config.duration = parseInt(val, 10);
    if (key === "--concurrency") config.concurrency = parseInt(val, 10);
    if (key === "--p95") config.p95ThresholdMs = parseInt(val, 10);
  }
  return config;
}

async function makeRequest(
  baseUrl: string,
  endpoint: { path: string; method: string; body?: unknown }
): Promise<RequestResult> {
  const start = performance.now();
  try {
    const url = new URL(endpoint.path, baseUrl);
    const res = await fetch(url.toString(), {
      method: endpoint.method,
      headers: endpoint.body ? { "Content-Type": "application/json" } : {},
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const durationMs = performance.now() - start;
    return {
      endpoint: endpoint.path,
      statusCode: res.status,
      durationMs,
      success: res.status < 500,
    };
  } catch (err) {
    const durationMs = performance.now() - start;
    return {
      endpoint: endpoint.path,
      statusCode: 0,
      durationMs,
      success: false,
    };
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runLoadTest(config: LoadTestConfig): Promise<boolean> {
  console.log(`\n🚀 Load Test — Subsumio API`);
  console.log(`   URL:         ${config.url}`);
  console.log(`   Duration:    ${config.duration}s`);
  console.log(`   Concurrency: ${config.concurrency}`);
  console.log(`   p95 target:  <${config.p95ThresholdMs}ms`);
  console.log(`   Endpoints:   ${ENDPOINTS.length}\n`);

  const results: RequestResult[] = [];
  const endTime = Date.now() + config.duration * 1000;
  let requestCount = 0;

  // Worker loop — each worker pulls from the endpoint rotation
  async function worker(workerId: number) {
    while (Date.now() < endTime) {
      const endpoint = ENDPOINTS[requestCount % ENDPOINTS.length];
      requestCount++;
      const result = await makeRequest(config.url, endpoint);
      results.push(result);
    }
  }

  // Start workers
  const workers = Array.from({ length: config.concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  // Aggregate results per endpoint
  const byEndpoint = new Map<string, RequestResult[]>();
  for (const r of results) {
    if (!byEndpoint.has(r.endpoint)) byEndpoint.set(r.endpoint, []);
    byEndpoint.get(r.endpoint)!.push(r);
  }

  console.log(`\n📊 Results (${results.length} requests in ${config.duration}s)\n`);
  console.log(
    "  Endpoint".padEnd(30) +
      "  Count".padStart(8) +
      "  p50".padStart(10) +
      "  p95".padStart(10) +
      "  p99".padStart(10) +
      "  Errors".padStart(10)
  );
  console.log("  " + "─".repeat(76));

  let allPassed = true;
  for (const endpoint of Array.from(byEndpoint.keys())) {
    const epResults = byEndpoint.get(endpoint)!;
    const durations = epResults.map((r) => r.durationMs).sort((a, b) => a - b);
    const errors = epResults.filter((r) => !r.success).length;
    const p50 = percentile(durations, 50);
    const p95 = percentile(durations, 95);
    const p99 = percentile(durations, 99);

    const passed = p95 < config.p95ThresholdMs && errors === 0;
    if (!passed) allPassed = false;

    const status = passed ? "✅" : "❌";
    console.log(
      `  ${status} ${endpoint.padEnd(27)}` +
        `${epResults.length}`.padStart(8) +
        `${p50.toFixed(0)}ms`.padStart(10) +
        `${p95.toFixed(0)}ms`.padStart(10) +
        `${p99.toFixed(0)}ms`.padStart(10) +
        `${errors}`.padStart(10)
    );
  }

  console.log("\n" + (allPassed ? "✅ All endpoints within threshold" : "❌ Threshold exceeded"));
  return allPassed;
}

// Main
const config = parseArgs();
runLoadTest(config)
  .then((passed) => {
    process.exit(passed ? 0 : 1);
  })
  .catch((err) => {
    console.error("Load test failed:", err);
    process.exit(1);
  });
