/**
 * Test Gate Store — T2.6 CI- und Release-Gates
 *
 * Persists gate results as structured JSON artifacts and append-only
 * trend data (JSONL). Works both locally and in CI.
 *
 * Storage layout:
 *   server/src/eval/test-gate/artifacts/<tier>/<timestamp>.json
 *   server/src/eval/test-gate/trends/<tier>.jsonl
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { GateResult, GateTier, TrendEntry, CheckCategory } from "./types.ts";

const BASE_DIR = join(dirname(new URL(import.meta.url).pathname), "..", "test-gate");
const ARTIFACTS_DIR = join(BASE_DIR, "artifacts");
const TRENDS_DIR = join(BASE_DIR, "trends");

function ensureDirs(tier: GateTier): { artifactPath: string; trendPath: string } {
  const artifactDir = join(ARTIFACTS_DIR, tier);
  const trendDir = TRENDS_DIR;
  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(trendDir, { recursive: true });
  return {
    artifactPath: join(artifactDir, `${tier}-latest.json`),
    trendPath: join(trendDir, `${tier}.jsonl`),
  };
}

export function saveGateResult(result: GateResult): {
  artifactPath: string;
  trendPath: string;
} {
  const { artifactPath, trendPath } = ensureDirs(result.tier);

  // Write full result artifact
  writeFileSync(artifactPath, JSON.stringify(result, null, 2) + "\n", "utf-8");

  // Also write timestamped copy for history
  const tsCopy = join(
    dirname(artifactPath),
    `${result.tier}-${result.timestamp.replace(/[:.]/g, "-")}.json`
  );
  writeFileSync(tsCopy, JSON.stringify(result, null, 2) + "\n", "utf-8");

  // Append trend entry
  const trend = toTrendEntry(result);
  appendFileSync(trendPath, JSON.stringify(trend) + "\n", "utf-8");

  return { artifactPath, trendPath };
}

export function toTrendEntry(result: GateResult): TrendEntry {
  const check_summary: Record<
    CheckCategory,
    { pass: number; fail: number; skip: number; error: number }
  > = {} as Record<CheckCategory, { pass: number; fail: number; skip: number; error: number }>;

  for (const check of result.checks) {
    if (!check_summary[check.category]) {
      check_summary[check.category] = { pass: 0, fail: 0, skip: 0, error: 0 };
    }
    const bucket = check_summary[check.category];
    if (check.status === "pass") bucket.pass++;
    else if (check.status === "fail") bucket.fail++;
    else if (check.status === "skip") bucket.skip++;
    else bucket.error++;
  }

  return {
    timestamp: result.timestamp,
    git_sha: result.git_sha,
    version: result.version,
    overall_status: result.overall_status,
    passed: result.passed,
    failed: result.failed,
    skipped: result.skipped,
    errored: result.errored,
    duration_ms: result.duration_ms,
    check_summary,
  };
}

export function readTrend(tier: GateTier): TrendEntry[] {
  const trendPath = join(TRENDS_DIR, `${tier}.jsonl`);
  if (!existsSync(trendPath)) return [];
  const lines = readFileSync(trendPath, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l) as TrendEntry);
}

export function getLatestArtifact(tier: GateTier): GateResult | null {
  const artifactPath = join(ARTIFACTS_DIR, tier, `${tier}-latest.json`);
  if (!existsSync(artifactPath)) return null;
  return JSON.parse(readFileSync(artifactPath, "utf-8")) as GateResult;
}

export function compareWithPrevious(
  current: GateResult,
  previous: GateResult | null
): { new_failures: string[]; new_passes: string[]; regressions: string[] } {
  if (!previous) {
    return { new_failures: [], new_passes: [], regressions: [] };
  }

  const prevMap = new Map(previous.checks.map((c) => [c.id, c.status]));
  const currMap = new Map(current.checks.map((c) => [c.id, c.status]));

  const new_failures: string[] = [];
  const new_passes: string[] = [];
  const regressions: string[] = [];

  for (const [id, status] of currMap) {
    const prev = prevMap.get(id);
    if (prev === "pass" && (status === "fail" || status === "error")) {
      regressions.push(id);
    } else if (prev !== "pass" && status === "pass") {
      new_passes.push(id);
    } else if (prev !== "fail" && prev !== "error" && (status === "fail" || status === "error")) {
      new_failures.push(id);
    }
  }

  return { new_failures, new_passes, regressions };
}
