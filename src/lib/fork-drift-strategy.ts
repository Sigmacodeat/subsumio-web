/**
 * Fork Drift Strategy — P1-SKILL-003
 * ===================================
 * Strategie für den Umgang mit Upstream-GBrain-Drift im Subsumio-Fork.
 *
 * Subsumio ist ein Fork von GBrain (github:garrytan/gbrain). Dieser Fork
 * divergiert durch Legal-Specific-Features (Matter Context, Legal Schema Pack,
 * Experience Layer, etc.). Die Strategie definiert:
 *
 *   1. Sync-Kadenz: Wie oft wird Upstream gemerged?
 *   2. Divergenz-Tracking: Welche Dateien sind modifiziert vs. neu?
 *   3. llms.txt-Regenerierung: Bei Fork-Änderungen neu generieren
 *   4. Regressions-Pinning: Welche Upstream-Versionen sind getestet?
 *   5. Conflict-Resolution: Wie werden Merge-Konflikte gelöst?
 *   6. CI-Gates: Automatische Checks für Fork-Drift
 */

// ── Types ─────────────────────────────────────────────────────────────

export type SyncCadence = "weekly" | "biweekly" | "monthly" | "quarterly";
export type DivergenceType = "added" | "modified" | "deleted" | "renamed";
export type ConflictResolution = "upstream_wins" | "fork_wins" | "manual_merge" | "fork_specific";

export interface ForkFileClassification {
  path: string;
  type: DivergenceType;
  /** Whether this file is fork-specific (not in upstream) */
  fork_specific: boolean;
  /** Whether this file is modified from upstream */
  modified_from_upstream: boolean;
  /** Conflict resolution strategy */
  resolution: ConflictResolution;
  /** Reason for divergence */
  reason: string;
  /** Risk level if upstream changes this file */
  merge_risk: "low" | "medium" | "high";
  /** Whether CI checks cover this file */
  ci_covered: boolean;
}

export interface SyncPolicy {
  cadence: SyncCadence;
  /** Minimum upstream version that must pass CI before merge */
  min_upstream_version: string;
  /** Whether to auto-merge non-conflicting upstream changes */
  auto_merge_safe: boolean;
  /** Whether to pin specific upstream commits */
  pin_commits: boolean;
  /** Pinned upstream commits (sha → reason) */
  pinned_commits: Record<string, string>;
  /** Files that should never be overwritten by upstream */
  protected_files: string[];
  /** Files that are always taken from upstream */
  upstream_owned_files: string[];
}

export interface DriftReport {
  upstream_version: string;
  fork_version: string;
  commits_behind: number;
  commits_ahead: number;
  diverged_files: ForkFileClassification[];
  new_upstream_files: string[];
  deleted_upstream_files: string[];
  merge_conflicts_expected: number;
  sync_recommended: boolean;
  urgency: "low" | "medium" | "high";
  generated_at: string;
}

export interface ForkDriftStrategy {
  upstream_repo: string;
  fork_repo: string;
  upstream_branch: string;
  fork_branch: string;
  sync_policy: SyncPolicy;
  file_classifications: ForkFileClassification[];
  llms_regen_required: boolean;
  regression_pinned_versions: PinnedVersion[];
  ci_gates: CiGate[];
  last_sync: string | null;
  next_sync_due: string | null;
}

export interface PinnedVersion {
  upstream_version: string;
  fork_version: string;
  pinned_at: string;
  ci_status: "pass" | "fail" | "pending";
  notes: string;
}

export interface CiGate {
  gate_name: string;
  description: string;
  command: string;
  blocking: boolean;
  /** Files that trigger this gate */
  trigger_files: string[];
}

// ── File Classifications ──────────────────────────────────────────────

export const FORK_FILE_CLASSIFICATIONS: ForkFileClassification[] = [
  // ── Fork-Specific Files (not in upstream) ────────────────────────────
  {
    path: "src/lib/legal-types.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Legal domain types — Matter, CaseFrontmatter, deadlines, parties",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/matter-context.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Matter Context Bundle builder — Subsumio-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/experience-layer.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Experience/Who-Knows Layer — Subsumio-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/retrieval-feedback.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Retrieval Feedback Loop — Subsumio-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/connector-coverage.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Connector Coverage Matrix — Subsumio-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/legal-schema-pack.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Legal Schema Pack — versioned data contract",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/mcp-exposure-eval.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "MCP Exposure Evaluation — Subsumio-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/eval-harness-reuse.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Unified Eval Harness — Subsumio-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/privilege-labels.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Privilege/Confidentiality Labels — Legal-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/ethics-enforcement.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Ethical Wall + AI Provider Policy — Legal-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/tenant-guard.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Multi-Tenant Guard — Subsumio-specific",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "src/lib/superbrain-eval.ts",
    type: "added",
    fork_specific: true,
    modified_from_upstream: false,
    resolution: "fork_specific",
    reason: "Superbrain Eval Gate — Subsumio-specific",
    merge_risk: "low",
    ci_covered: true,
  },

  // ── Modified from Upstream ───────────────────────────────────────────
  {
    path: "server/src/mcp/server.ts",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: true,
    resolution: "manual_merge",
    reason: "MCP server — potential upstream changes to tool registration",
    merge_risk: "medium",
    ci_covered: true,
  },
  {
    path: "server/src/core/operations.ts",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: true,
    resolution: "manual_merge",
    reason: "Operations — upstream may add new ops, fork adds legal-specific ops",
    merge_risk: "high",
    ci_covered: true,
  },
  {
    path: "server/src/core/types.ts",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: true,
    resolution: "manual_merge",
    reason: "Types — upstream may extend SearchResult, fork adds legal fields",
    merge_risk: "high",
    ci_covered: true,
  },
  {
    path: "server/src/core/search/hybrid.ts",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: true,
    resolution: "manual_merge",
    reason: "Hybrid search — upstream may change RRF pipeline, fork adds legal boosts",
    merge_risk: "high",
    ci_covered: true,
  },
  {
    path: "server/src/core/search/rerank.ts",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: true,
    resolution: "manual_merge",
    reason: "Reranker — upstream may change call-site, fork adds feedback boosts",
    merge_risk: "medium",
    ci_covered: true,
  },
  {
    path: "llms.txt",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: true,
    resolution: "fork_wins",
    reason: "LLMs.txt — must be regenerated for fork (different URL base)",
    merge_risk: "low",
    ci_covered: false,
  },
  {
    path: "llms-full.txt",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: true,
    resolution: "fork_wins",
    reason: "LLMs-full.txt — must be regenerated for fork",
    merge_risk: "low",
    ci_covered: false,
  },

  // ── Upstream-Owned (always take from upstream) ───────────────────────
  {
    path: "server/src/core/pglite-engine.ts",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: false,
    resolution: "upstream_wins",
    reason: "PGLite engine — upstream owns this, no fork modifications",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "server/src/core/postgres-engine.ts",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: false,
    resolution: "upstream_wins",
    reason: "Postgres engine — upstream owns this",
    merge_risk: "low",
    ci_covered: true,
  },
  {
    path: "server/src/mcp/tool-defs.ts",
    type: "modified",
    fork_specific: false,
    modified_from_upstream: false,
    resolution: "upstream_wins",
    reason: "MCP tool defs — upstream owns this",
    merge_risk: "low",
    ci_covered: true,
  },
];

// ── Sync Policy ───────────────────────────────────────────────────────

export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  cadence: "biweekly",
  min_upstream_version: "0.32.0",
  auto_merge_safe: true,
  pin_commits: true,
  pinned_commits: {},
  protected_files: [
    "src/lib/legal-types.ts",
    "src/lib/matter-context.ts",
    "src/lib/experience-layer.ts",
    "src/lib/privilege-labels.ts",
    "src/lib/ethics-enforcement.ts",
    "src/lib/tenant-guard.ts",
    "src/lib/legal-schema-pack.ts",
    "src/lib/mcp-exposure-eval.ts",
    "src/lib/connector-coverage.ts",
    "src/lib/retrieval-feedback.ts",
    "src/lib/eval-harness-reuse.ts",
    "src/lib/superbrain-eval.ts",
    "docs/architecture/multi-tenant-architecture.md",
  ],
  upstream_owned_files: [
    "server/src/core/pglite-engine.ts",
    "server/src/core/postgres-engine.ts",
    "server/src/mcp/tool-defs.ts",
    "server/src/mcp/dispatch.ts",
  ],
};

// ── CI Gates ──────────────────────────────────────────────────────────

export const FORK_DRIFT_CI_GATES: CiGate[] = [
  {
    gate_name: "fork-files-protected",
    description: "Verifies that protected fork files are not overwritten by upstream merges",
    command: "bun run scripts/check-protected-files.ts",
    blocking: true,
    trigger_files: [
      "src/lib/legal-types.ts",
      "src/lib/matter-context.ts",
      "src/lib/experience-layer.ts",
    ],
  },
  {
    gate_name: "llms-regenerated",
    description: "Verifies that llms.txt and llms-full.txt are regenerated with fork URL base",
    command:
      "LLMS_REPO_BASE=https://raw.githubusercontent.com/Sigmacodeat/subsumio-web/main bun run build:llms && git diff --exit-code llms.txt llms-full.txt",
    blocking: false,
    trigger_files: ["llms.txt", "llms-full.txt"],
  },
  {
    gate_name: "upstream-regression",
    description: "Runs full test suite against pinned upstream version to detect regressions",
    command: "bun test",
    blocking: true,
    trigger_files: ["server/src/**", "src/lib/**"],
  },
  {
    gate_name: "schema-pack-version",
    description: "Verifies legal schema pack version is consistent and migrations are ordered",
    command: "bunx vitest run src/lib/legal-schema-pack.test.ts",
    blocking: true,
    trigger_files: ["src/lib/legal-schema-pack.ts"],
  },
  {
    gate_name: "mcp-exposure-eval",
    description: "Runs MCP exposure evaluation to verify trust boundaries are intact",
    command: "bunx vitest run src/lib/mcp-exposure-eval.test.ts",
    blocking: true,
    trigger_files: ["src/lib/mcp-exposure-eval.ts", "server/src/mcp/**"],
  },
  {
    gate_name: "eval-harness-reuse",
    description: "Verifies unified eval harness still passes with upstream changes",
    command: "bunx vitest run src/lib/eval-harness-reuse.test.ts",
    blocking: true,
    trigger_files: [
      "src/lib/eval-harness-reuse.ts",
      "src/lib/superbrain-eval.ts",
      "src/lib/rag-eval.ts",
      "src/lib/release-gate.ts",
      "src/lib/ai-quality.ts",
    ],
  },
];

// ── Pinned Versions ───────────────────────────────────────────────────

export const REGRESSION_PINNED_VERSIONS: PinnedVersion[] = [
  {
    upstream_version: "0.32.3",
    fork_version: "0.1.0-alpha",
    pinned_at: "2026-06-15",
    ci_status: "pass",
    notes: "Initial fork pin — search modes added in v0.32.3, verified compatible",
  },
  {
    upstream_version: "0.34.1",
    fork_version: "0.1.0-alpha",
    pinned_at: "2026-06-18",
    ci_status: "pass",
    notes: "MCP_STDIO=1 fix (#870) — verified no impact on fork MCP exposure",
  },
  {
    upstream_version: "0.36.4.0",
    fork_version: "0.1.0-alpha",
    pinned_at: "2026-06-20",
    ci_status: "pass",
    notes: "Remediation plan + target health score — verified compatible with fork eval harness",
  },
];

// ── Fork Drift Strategy Definition ────────────────────────────────────

export const FORK_DRIFT_STRATEGY: ForkDriftStrategy = {
  upstream_repo: "subsumio-engine",
  fork_repo: "github:Sigmacodeat/subsumio-web",
  upstream_branch: "main",
  fork_branch: "main",
  sync_policy: DEFAULT_SYNC_POLICY,
  file_classifications: FORK_FILE_CLASSIFICATIONS,
  llms_regen_required: true,
  regression_pinned_versions: REGRESSION_PINNED_VERSIONS,
  ci_gates: FORK_DRIFT_CI_GATES,
  last_sync: "2026-06-20",
  next_sync_due: "2026-07-04",
};

// ── Helpers ───────────────────────────────────────────────────────────

export function getForkSpecificFiles(): ForkFileClassification[] {
  return FORK_FILE_CLASSIFICATIONS.filter((f) => f.fork_specific);
}

export function getModifiedFromUpstreamFiles(): ForkFileClassification[] {
  return FORK_FILE_CLASSIFICATIONS.filter((f) => f.modified_from_upstream);
}

export function getUpstreamOwnedFiles(): ForkFileClassification[] {
  return FORK_FILE_CLASSIFICATIONS.filter((f) => f.resolution === "upstream_wins");
}

export function getHighRiskFiles(): ForkFileClassification[] {
  return FORK_FILE_CLASSIFICATIONS.filter((f) => f.merge_risk === "high");
}

export function getProtectedFiles(): string[] {
  return DEFAULT_SYNC_POLICY.protected_files;
}

export function getFileClassification(path: string): ForkFileClassification | undefined {
  return FORK_FILE_CLASSIFICATIONS.find((f) => f.path === path);
}

export function isFileProtected(path: string): boolean {
  return DEFAULT_SYNC_POLICY.protected_files.includes(path);
}

export function isFileUpstreamOwned(path: string): boolean {
  return DEFAULT_SYNC_POLICY.upstream_owned_files.includes(path);
}

export function getLatestPinnedVersion(): PinnedVersion | undefined {
  if (REGRESSION_PINNED_VERSIONS.length === 0) return undefined;
  return REGRESSION_PINNED_VERSIONS[REGRESSION_PINNED_VERSIONS.length - 1];
}

export function getPinnedVersion(upstreamVersion: string): PinnedVersion | undefined {
  return REGRESSION_PINNED_VERSIONS.find((v) => v.upstream_version === upstreamVersion);
}

export function getCiGatesForFile(path: string): CiGate[] {
  return FORK_DRIFT_CI_GATES.filter((g) =>
    g.trigger_files.some((pattern) => {
      if (pattern.endsWith("/**")) {
        const prefix = pattern.slice(0, -3);
        return path.startsWith(prefix);
      }
      return path === pattern;
    })
  );
}

export function getBlockingGates(): CiGate[] {
  return FORK_DRIFT_CI_GATES.filter((g) => g.blocking);
}

// ── Drift Report Builder ──────────────────────────────────────────────

export function buildDriftReport(
  upstreamVersion: string,
  forkVersion: string,
  commitsBehind: number,
  commitsAhead: number,
  newUpstreamFiles: string[] = [],
  deletedUpstreamFiles: string[] = []
): DriftReport {
  const divergedFiles = getModifiedFromUpstreamFiles();
  const highRiskCount = divergedFiles.filter((f) => f.merge_risk === "high").length;

  const expectedConflicts = Math.min(
    highRiskCount,
    newUpstreamFiles.length + deletedUpstreamFiles.length
  );

  const urgency: "low" | "medium" | "high" =
    commitsBehind > 50 ? "high" : commitsBehind > 20 ? "medium" : "low";

  const syncRecommended = commitsBehind > 10 || urgency === "high";

  return {
    upstream_version: upstreamVersion,
    fork_version: forkVersion,
    commits_behind: commitsBehind,
    commits_ahead: commitsAhead,
    diverged_files: divergedFiles,
    new_upstream_files: newUpstreamFiles,
    deleted_upstream_files: deletedUpstreamFiles,
    merge_conflicts_expected: expectedConflicts,
    sync_recommended: syncRecommended,
    urgency,
    generated_at: new Date().toISOString(),
  };
}

// ── Validation ────────────────────────────────────────────────────────

export interface DriftStrategyValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateDriftStrategy(): DriftStrategyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file classifications
  const paths = new Set<string>();
  for (const file of FORK_FILE_CLASSIFICATIONS) {
    if (paths.has(file.path)) {
      errors.push(`Duplicate file classification: ${file.path}`);
    }
    paths.add(file.path);
  }

  // Check protected files exist in classifications
  for (const protectedFile of DEFAULT_SYNC_POLICY.protected_files) {
    const classification = FORK_FILE_CLASSIFICATIONS.find((f) => f.path === protectedFile);
    if (!classification) {
      warnings.push(`Protected file not in classifications: ${protectedFile}`);
    } else if (!classification.fork_specific) {
      warnings.push(
        `Protected file ${protectedFile} is not fork-specific — it may be overwritten by upstream`
      );
    }
  }

  // Check pinned versions are ordered
  for (let i = 1; i < REGRESSION_PINNED_VERSIONS.length; i++) {
    const prev = REGRESSION_PINNED_VERSIONS[i - 1];
    const curr = REGRESSION_PINNED_VERSIONS[i];
    if (prev.pinned_at > curr.pinned_at) {
      errors.push(
        `Pinned versions not ordered: ${prev.upstream_version} (${prev.pinned_at}) before ${curr.upstream_version} (${curr.pinned_at})`
      );
    }
  }

  // Check CI gates have commands
  for (const gate of FORK_DRIFT_CI_GATES) {
    if (!gate.command || gate.command.trim().length === 0) {
      errors.push(`CI gate ${gate.gate_name} has no command`);
    }
  }

  // Check llms regen
  if (FORK_DRIFT_STRATEGY.llms_regen_required) {
    const llmsGate = FORK_DRIFT_CI_GATES.find((g) => g.gate_name === "llms-regenerated");
    if (!llmsGate) {
      warnings.push("llms.txt regeneration is required but no CI gate checks for it");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Summary ───────────────────────────────────────────────────────────

export interface DriftStrategySummary {
  upstream_repo: string;
  fork_repo: string;
  sync_cadence: SyncCadence;
  total_classified_files: number;
  fork_specific_files: number;
  modified_from_upstream: number;
  upstream_owned: number;
  high_risk_files: number;
  protected_files: number;
  ci_gates: number;
  blocking_gates: number;
  pinned_versions: number;
  latest_pinned_version: string | null;
  llms_regen_required: boolean;
  last_sync: string | null;
  next_sync_due: string | null;
}

export function getDriftStrategySummary(): DriftStrategySummary {
  const latest = getLatestPinnedVersion();
  return {
    upstream_repo: FORK_DRIFT_STRATEGY.upstream_repo,
    fork_repo: FORK_DRIFT_STRATEGY.fork_repo,
    sync_cadence: DEFAULT_SYNC_POLICY.cadence,
    total_classified_files: FORK_FILE_CLASSIFICATIONS.length,
    fork_specific_files: getForkSpecificFiles().length,
    modified_from_upstream: getModifiedFromUpstreamFiles().length,
    upstream_owned: getUpstreamOwnedFiles().length,
    high_risk_files: getHighRiskFiles().length,
    protected_files: DEFAULT_SYNC_POLICY.protected_files.length,
    ci_gates: FORK_DRIFT_CI_GATES.length,
    blocking_gates: getBlockingGates().length,
    pinned_versions: REGRESSION_PINNED_VERSIONS.length,
    latest_pinned_version: latest?.upstream_version ?? null,
    llms_regen_required: FORK_DRIFT_STRATEGY.llms_regen_required,
    last_sync: FORK_DRIFT_STRATEGY.last_sync,
    next_sync_due: FORK_DRIFT_STRATEGY.next_sync_due,
  };
}
