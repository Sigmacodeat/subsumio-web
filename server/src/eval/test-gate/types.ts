/**
 * Test Gate Types — T2.6 CI- und Release-Gates
 *
 * Defines the type system for the unified test-gate system.
 * Gates are tiers of tests that run at different CI stages:
 *   smoke → nightly → release → holdout
 */

export type GateTier = "smoke" | "nightly" | "release" | "holdout";

export type CheckStatus = "pass" | "fail" | "skip" | "error";

export type CheckCategory =
  | "typecheck"
  | "lint"
  | "unit"
  | "e2e"
  | "benchmark"
  | "security"
  | "isolation"
  | "build"
  | "quality";

export interface GateCheck {
  id: string;
  name: string;
  category: CheckCategory;
  command: string;
  cwd?: string;
  timeout_ms?: number;
  env?: Record<string, string>;
  required: boolean;
  description: string;
}

export interface GateCheckResult {
  id: string;
  name: string;
  category: CheckCategory;
  status: CheckStatus;
  duration_ms: number;
  exit_code: number;
  stdout_tail?: string;
  stderr_tail?: string;
  error?: string;
}

export interface GateResult {
  tier: GateTier;
  timestamp: string;
  git_sha?: string;
  git_ref?: string;
  version?: string;
  runner: string;
  duration_ms: number;
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  overall_status: CheckStatus;
  checks: GateCheckResult[];
  metadata?: Record<string, unknown>;
}

export interface TrendEntry {
  timestamp: string;
  git_sha?: string;
  version?: string;
  overall_status: CheckStatus;
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  duration_ms: number;
  check_summary: Record<CheckCategory, { pass: number; fail: number; skip: number; error: number }>;
}

export const GATE_TIERS: GateTier[] = ["smoke", "nightly", "release", "holdout"];

export const ALL_CATEGORIES: CheckCategory[] = [
  "typecheck",
  "lint",
  "unit",
  "e2e",
  "benchmark",
  "security",
  "isolation",
  "build",
  "quality",
];
