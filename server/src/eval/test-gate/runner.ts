/**
 * Test Gate Runner — T2.6 CI- und Release-Gates
 *
 * Executes all checks for a given gate tier, collects results,
 * and persists artifacts + trend data.
 *
 * Usage:
 *   bun run server/src/eval/test-gate/runner.ts --tier=smoke
 *   bun run server/src/eval/test-gate/runner.ts --tier=nightly
 *   bun run server/src/eval/test-gate/runner.ts --tier=release
 *   bun run server/src/eval/test-gate/runner.ts --tier=holdout
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { GATE_CONFIG, GATE_DESCRIPTIONS } from "./config.ts";
import { saveGateResult, readTrend, compareWithPrevious, getLatestArtifact } from "./store.ts";
import type { GateResult, GateCheckResult, GateTier, CheckStatus } from "./types.ts";

function getGitInfo(): { sha?: string; ref?: string } {
  try {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    const ref = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    return { sha, ref };
  } catch {
    return {};
  }
}

function getVersion(): string {
  try {
    const versionFile = resolve(process.cwd(), "VERSION");
    if (existsSync(versionFile)) {
      return readFileSync(versionFile, "utf-8").trim();
    }
  } catch {}
  return "unknown";
}

interface RunCheckOptions {
  timeout_ms?: number;
  cwd?: string;
  env?: Record<string, string>;
}

function runCheck(
  id: string,
  name: string,
  command: string,
  opts: RunCheckOptions = {}
): Promise<GateCheckResult> {
  const startTime = Date.now();
  const timeoutMs = opts.timeout_ms ?? 300_000;

  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], {
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const MAX_TAIL = 2000;

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > MAX_TAIL * 4) {
        stdout = stdout.slice(-MAX_TAIL * 2);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > MAX_TAIL * 4) {
        stderr = stderr.slice(-MAX_TAIL * 2);
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      const duration = Date.now() - startTime;
      resolve({
        id,
        name,
        category: getCategoryFromId(id),
        status: "error",
        duration_ms: duration,
        exit_code: -1,
        stderr_tail: stderr.slice(-MAX_TAIL),
        error: `Timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      const status: CheckStatus = code === 0 ? "pass" : "fail";

      resolve({
        id,
        name,
        category: getCategoryFromId(id),
        status,
        duration_ms: duration,
        exit_code: code ?? -1,
        stdout_tail: stdout.slice(-MAX_TAIL),
        stderr_tail: stderr.slice(-MAX_TAIL),
      });
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      resolve({
        id,
        name,
        category: getCategoryFromId(id),
        status: "error",
        duration_ms: duration,
        exit_code: -1,
        error: err.message,
      });
    });
  });
}

function getCategoryFromId(id: string): GateCheckResult["category"] {
  if (id.startsWith("typecheck")) return "typecheck";
  if (id === "lint" || id === "format-check") return "lint";
  if (id.startsWith("unit")) return "unit";
  if (id.startsWith("playwright") || id === "workflow-simulation" || id === "heavy-tests")
    return "e2e";
  if (id.includes("benchmark") || id.includes("retrieval") || id.includes("pipeline"))
    return "benchmark";
  if (id === "gitleaks" || id === "bun-audit") return "security";
  if (id.includes("corpus") || id.includes("isolation")) return "isolation";
  if (id === "build-verification" || id === "server-verify") return "build";
  if (id.includes("release-gate") || id.includes("subsumption") || id.includes("ab-model"))
    return "quality";
  return "unit";
}

function parseArgs(): { tier: GateTier; continueOnError: boolean } {
  const args = process.argv.slice(2);
  let tier: GateTier = "smoke";
  let continueOnError = false;

  for (const arg of args) {
    if (arg.startsWith("--tier=")) {
      const t = arg.slice(7) as GateTier;
      if (["smoke", "nightly", "release", "holdout"].includes(t)) {
        tier = t;
      } else {
        console.error(`Unknown tier: ${t}. Must be one of: smoke, nightly, release, holdout`);
        process.exit(1);
      }
    } else if (arg === "--continue-on-error" || arg === "-c") {
      continueOnError = true;
    }
  }

  return { tier, continueOnError };
}

async function main() {
  const { tier, continueOnError } = parseArgs();
  const checks = GATE_CONFIG[tier];

  console.log(`\n${"=".repeat(80)}`);
  console.log(`  Test Gate: ${tier.toUpperCase()}`);
  console.log(`  ${GATE_DESCRIPTIONS[tier]}`);
  console.log(`  Checks: ${checks.length}`);
  console.log(`${"=".repeat(80)}\n`);

  const gitInfo = getGitInfo();
  const version = getVersion();
  const startTime = Date.now();
  const results: GateCheckResult[] = [];

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const num = `[${i + 1}/${checks.length}]`;
    console.log(`\n${num} ▶ ${check.name}`);
    console.log(`    Category: ${check.category}`);
    console.log(`    Command:  ${check.command}`);
    if (check.cwd) console.log(`    Cwd:      ${check.cwd}`);
    console.log(`    Required: ${check.required}`);

    const result = await runCheck(check.id, check.name, check.command, {
      timeout_ms: check.timeout_ms,
      cwd: check.cwd,
      env: check.env,
    });

    results.push(result);

    const icon = result.status === "pass" ? "✅" : result.status === "fail" ? "❌" : "⚠️";
    const duration = (result.duration_ms / 1000).toFixed(1);
    console.log(`    ${icon} ${result.status.toUpperCase()} (${duration}s)`);

    if (result.status !== "pass" && result.stderr_tail) {
      console.log(`    ── stderr (tail) ──`);
      console.log(`    ${result.stderr_tail.split("\n").slice(-5).join("\n    ")}`);
    }

    if (result.status !== "pass" && check.required && !continueOnError) {
      console.log(`\n⚠️  Required check failed — stopping. Use --continue-on-error to run all.`);
      break;
    }
  }

  const totalDuration = Date.now() - startTime;
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const errored = results.filter((r) => r.status === "error").length;
  const overall: CheckStatus = failed > 0 || errored > 0 ? "fail" : "pass";

  const gateResult: GateResult = {
    tier,
    timestamp: new Date().toISOString(),
    git_sha: gitInfo.sha,
    git_ref: gitInfo.ref,
    version,
    runner: process.env.CI ? "github-actions" : "local",
    duration_ms: totalDuration,
    passed,
    failed,
    skipped,
    errored,
    overall_status: overall,
    checks: results,
  };

  // Save artifact + trend
  const { artifactPath, trendPath } = saveGateResult(gateResult);

  // Compare with previous run (from trend data)
  const trend = readTrend(tier);
  const previous = getLatestArtifact(tier);
  const comparison = compareWithPrevious(gateResult, previous);

  // Summary
  console.log(`\n${"=".repeat(80)}`);
  console.log(
    `  Gate Result: ${tier.toUpperCase()} → ${overall === "pass" ? "✅ PASS" : "❌ FAIL"}`
  );
  console.log(`${"=".repeat(80)}`);
  console.log(`  Passed:   ${passed}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errored:  ${errored}`);
  console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  Artifact: ${artifactPath}`);
  console.log(`  Trend:    ${trendPath}`);
  console.log(`  Git SHA:  ${gitInfo.sha ?? "unknown"}`);
  console.log(`  Version:  ${version}`);
  console.log(`  Trend entries: ${trend.length}`);
  if (comparison.regressions.length > 0) {
    console.log(`  ⚠️  Regressions: ${comparison.regressions.join(", ")}`);
  }
  if (comparison.new_passes.length > 0) {
    console.log(`  ✅ New passes: ${comparison.new_passes.join(", ")}`);
  }
  console.log(`${"=".repeat(80)}\n`);

  // Per-check summary table
  console.log("  Check Results:");
  console.log("  " + "─".repeat(76));
  console.log(`  ${"ID".padEnd(30)} ${"STATUS".padEnd(8)} ${"DURATION".padEnd(10)} ${"CATEGORY"}`);
  console.log("  " + "─".repeat(76));
  for (const r of results) {
    const dur = `${(r.duration_ms / 1000).toFixed(1)}s`;
    console.log(`  ${r.id.padEnd(30)} ${r.status.padEnd(8)} ${dur.padEnd(10)} ${r.category}`);
  }
  console.log("  " + "─".repeat(76));
  console.log("");

  process.exit(overall === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
