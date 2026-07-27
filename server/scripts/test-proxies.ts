#!/usr/bin/env bun
/**
 * Test all configured RIS proxies — check connectivity, speed, and RIS access.
 *
 * Usage:
 *   RIS_PROXY_URLS="http://user:pass@host1:port|frontproxy,http://user:pass@host2:port|webshare" \
 *   bun scripts/test-proxies.ts
 *
 * Tests each proxy by:
 *   1. Fetching httpbin.org/ip (connectivity + exit IP)
 *   2. Fetching https://www.ris.bka.gv.at/ (RIS accessibility)
 *   3. Measuring response time
 */

import {
  hasProxies,
  proxyFetchOptions,
  getUserAgent,
  logProxyConfig,
  proxyStatus,
} from "./ris-proxy";

interface TestResult {
  label: string;
  proxyUrl: string;
  exitIp?: string;
  risAccessible: boolean;
  risStatus?: number;
  risSize?: number;
  latencyMs: number;
  error?: string;
}

async function testProxy(label: string, proxyUrl: string): Promise<TestResult> {
  const result: TestResult = { label, proxyUrl, risAccessible: false, latencyMs: 0 };
  const startTime = Date.now();

  try {
    // Test 1: Connectivity via httpbin
    const ipRes = await fetch("https://httpbin.org/ip", {
      proxy: proxyUrl,
      headers: { "User-Agent": getUserAgent() },
      signal: AbortSignal.timeout(15_000),
    });
    if (!ipRes.ok) {
      result.error = `httpbin HTTP ${ipRes.status}`;
      result.latencyMs = Date.now() - startTime;
      return result;
    }
    const ipData = (await ipRes.json()) as { origin?: string };
    result.exitIp = ipData.origin;

    // Test 2: RIS accessibility
    const risRes = await fetch("https://www.ris.bka.gv.at/", {
      proxy: proxyUrl,
      headers: { "User-Agent": getUserAgent() },
      signal: AbortSignal.timeout(15_000),
    });
    result.risStatus = risRes.status;
    result.risAccessible = risRes.ok;
    result.risSize = (await risRes.text()).length;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  result.latencyMs = Date.now() - startTime;
  return result;
}

async function main() {
  logProxyConfig();

  if (!hasProxies()) {
    console.error("\n❌ No proxies configured. Set RIS_PROXY_URLS env var.");
    console.error(
      '   Example: RIS_PROXY_URLS="http://user:pass@host:port|label1,http://user:pass@host2:port|label2"'
    );
    process.exit(1);
  }

  // Parse proxy URLs directly from env (bypass round-robin)
  const raw = process.env.RIS_PROXY_URLS!.trim();
  const entries = raw.split(",").map((s, i) => {
    const [url, label] = s.trim().split("|");
    return { url: url!.trim(), label: (label?.trim() || `proxy-${i + 1}`).slice(0, 20) };
  });

  console.log(`\nTesting ${entries.length} proxy(ies)...\n`);

  const results: TestResult[] = [];
  for (const entry of entries) {
    process.stdout.write(`  Testing ${entry.label}... `);
    const result = await testProxy(entry.label, entry.url);
    results.push(result);

    if (result.error) {
      console.log(`❌ ERROR: ${result.error} (${result.latencyMs}ms)`);
    } else {
      const risOk = result.risAccessible ? "✅ RIS OK" : "❌ RIS FAIL";
      console.log(
        `✅ IP=${result.exitIp} ${risOk} ` +
          `status=${result.risStatus} size=${result.risSize} (${result.latencyMs}ms)`
      );
    }
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");

  const working = results.filter((r) => !r.error && r.risAccessible);
  const failed = results.filter((r) => r.error || !r.risAccessible);

  for (const r of results) {
    const status = r.error ? "❌ FAIL" : r.risAccessible ? "✅ OK  " : "⚠ RIS BLOCKED";
    console.log(`  ${status}  ${r.label.padEnd(20)} IP=${r.exitIp ?? "n/a"}  ${r.latencyMs}ms`);
  }

  console.log(`\n  Working: ${working.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.length}/${results.length}`);
  }

  if (working.length > 0) {
    console.log("\n  ✅ Ready for backfill! Concurrency recommendation:");
    console.log(`     RIS_PROXY_CONCURRENCY=${Math.min(working.length * 2, 20)}`);
  } else {
    console.log("\n  ❌ No working proxies — check credentials or try different providers.");
    process.exit(1);
  }
}

main().catch(console.error);
