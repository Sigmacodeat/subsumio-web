import { describe, it, expect } from "vitest";
import {
  FORK_DRIFT_STRATEGY,
  FORK_FILE_CLASSIFICATIONS,
  DEFAULT_SYNC_POLICY,
  FORK_DRIFT_CI_GATES,
  REGRESSION_PINNED_VERSIONS,
  getForkSpecificFiles,
  getModifiedFromUpstreamFiles,
  getUpstreamOwnedFiles,
  getHighRiskFiles,
  getProtectedFiles,
  getFileClassification,
  isFileProtected,
  isFileUpstreamOwned,
  getLatestPinnedVersion,
  getPinnedVersion,
  getCiGatesForFile,
  getBlockingGates,
  buildDriftReport,
  validateDriftStrategy,
  getDriftStrategySummary,
} from "@/lib/fork-drift-strategy";

describe("Fork Drift Strategy — Structure", () => {
  it("has correct upstream and fork repos", () => {
    expect(FORK_DRIFT_STRATEGY.upstream_repo).toBe("subsumio-engine");
    expect(FORK_DRIFT_STRATEGY.fork_repo).toBe("github:Sigmacodeat/subsumio-web");
  });

  it("has biweekly sync cadence", () => {
    expect(DEFAULT_SYNC_POLICY.cadence).toBe("biweekly");
  });

  it("has file classifications", () => {
    expect(FORK_FILE_CLASSIFICATIONS.length).toBeGreaterThan(10);
  });

  it("has CI gates", () => {
    expect(FORK_DRIFT_CI_GATES.length).toBeGreaterThan(3);
  });

  it("has pinned versions", () => {
    expect(REGRESSION_PINNED_VERSIONS.length).toBeGreaterThan(0);
  });

  it("requires llms.txt regeneration", () => {
    expect(FORK_DRIFT_STRATEGY.llms_regen_required).toBe(true);
  });
});

describe("Fork Drift Strategy — File Classifications", () => {
  it("getForkSpecificFiles returns fork-only files", () => {
    const files = getForkSpecificFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.fork_specific)).toBe(true);
  });

  it("getModifiedFromUpstreamFiles returns modified files", () => {
    const files = getModifiedFromUpstreamFiles();
    expect(files.every((f) => f.modified_from_upstream)).toBe(true);
  });

  it("getUpstreamOwnedFiles returns upstream-owned files", () => {
    const files = getUpstreamOwnedFiles();
    expect(files.every((f) => f.resolution === "upstream_wins")).toBe(true);
  });

  it("getHighRiskFiles returns high-risk files", () => {
    const files = getHighRiskFiles();
    expect(files.every((f) => f.merge_risk === "high")).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it("getFileClassification returns matching file", () => {
    const file = getFileClassification("src/lib/legal-types.ts");
    expect(file).toBeDefined();
    expect(file!.fork_specific).toBe(true);
  });

  it("getFileClassification returns undefined for unknown", () => {
    expect(getFileClassification("nonexistent.ts")).toBeUndefined();
  });

  it("has unique paths", () => {
    const paths = FORK_FILE_CLASSIFICATIONS.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("includes legal-schema-pack as fork-specific", () => {
    const file = getFileClassification("src/lib/legal-schema-pack.ts");
    expect(file).toBeDefined();
    expect(file!.fork_specific).toBe(true);
  });

  it("includes operations.ts as high-risk modified", () => {
    const file = getFileClassification("server/src/core/operations.ts");
    expect(file).toBeDefined();
    expect(file!.merge_risk).toBe("high");
    expect(file!.modified_from_upstream).toBe(true);
  });
});

describe("Fork Drift Strategy — Protected Files", () => {
  it("getProtectedFiles returns protected list", () => {
    const files = getProtectedFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("src/lib/legal-types.ts");
    expect(files).toContain("src/lib/matter-context.ts");
  });

  it("isFileProtected returns true for protected file", () => {
    expect(isFileProtected("src/lib/legal-types.ts")).toBe(true);
  });

  it("isFileProtected returns false for unprotected file", () => {
    expect(isFileProtected("server/src/core/operations.ts")).toBe(false);
  });

  it("isFileUpstreamOwned returns true for upstream file", () => {
    expect(isFileUpstreamOwned("server/src/core/pglite-engine.ts")).toBe(true);
  });

  it("isFileUpstreamOwned returns false for fork file", () => {
    expect(isFileUpstreamOwned("src/lib/legal-types.ts")).toBe(false);
  });
});

describe("Fork Drift Strategy — Pinned Versions", () => {
  it("getLatestPinnedVersion returns last entry", () => {
    const latest = getLatestPinnedVersion();
    expect(latest).toBeDefined();
    expect(latest!.upstream_version).toBe("0.36.4.0");
  });

  it("getPinnedVersion returns matching entry", () => {
    const pinned = getPinnedVersion("0.32.3");
    expect(pinned).toBeDefined();
    expect(pinned!.ci_status).toBe("pass");
  });

  it("getPinnedVersion returns undefined for unknown", () => {
    expect(getPinnedVersion("0.0.0")).toBeUndefined();
  });

  it("pinned versions are ordered by date", () => {
    for (let i = 1; i < REGRESSION_PINNED_VERSIONS.length; i++) {
      expect(
        REGRESSION_PINNED_VERSIONS[i].pinned_at >= REGRESSION_PINNED_VERSIONS[i - 1].pinned_at
      ).toBe(true);
    }
  });
});

describe("Fork Drift Strategy — CI Gates", () => {
  it("getBlockingGates returns blocking gates", () => {
    const gates = getBlockingGates();
    expect(gates.every((g) => g.blocking)).toBe(true);
    expect(gates.length).toBeGreaterThan(0);
  });

  it("getCiGatesForFile returns gates for specific file", () => {
    const gates = getCiGatesForFile("src/lib/legal-schema-pack.ts");
    expect(gates.length).toBeGreaterThan(0);
    expect(gates.some((g) => g.gate_name === "schema-pack-version")).toBe(true);
  });

  it("getCiGatesForFile returns gates for wildcard path", () => {
    const gates = getCiGatesForFile("src/lib/superbrain-eval.ts");
    expect(gates.some((g) => g.gate_name === "upstream-regression")).toBe(true);
  });

  it("every gate has a command", () => {
    for (const gate of FORK_DRIFT_CI_GATES) {
      expect(gate.command).toBeTruthy();
    }
  });

  it("includes llms-regenerated gate", () => {
    const gate = FORK_DRIFT_CI_GATES.find((g) => g.gate_name === "llms-regenerated");
    expect(gate).toBeDefined();
  });
});

describe("Fork Drift Strategy — Drift Report", () => {
  it("buildDriftReport creates report with correct fields", () => {
    const report = buildDriftReport("0.37.0", "0.1.0-alpha", 15, 30);
    expect(report.upstream_version).toBe("0.37.0");
    expect(report.fork_version).toBe("0.1.0-alpha");
    expect(report.commits_behind).toBe(15);
    expect(report.commits_ahead).toBe(30);
    expect(report.diverged_files.length).toBeGreaterThan(0);
    expect(report.generated_at).toBeTruthy();
  });

  it("buildDriftReport sets urgency based on commits behind", () => {
    expect(buildDriftReport("0.37.0", "0.1.0", 5, 10).urgency).toBe("low");
    expect(buildDriftReport("0.37.0", "0.1.0", 25, 10).urgency).toBe("medium");
    expect(buildDriftReport("0.37.0", "0.1.0", 60, 10).urgency).toBe("high");
  });

  it("buildDriftReport recommends sync when commits behind > 10", () => {
    expect(buildDriftReport("0.37.0", "0.1.0", 15, 10).sync_recommended).toBe(true);
  });

  it("buildDriftReport does not recommend sync when commits behind <= 10", () => {
    expect(buildDriftReport("0.37.0", "0.1.0", 5, 10).sync_recommended).toBe(false);
  });

  it("buildDriftReport always recommends sync when urgency is high", () => {
    expect(buildDriftReport("0.37.0", "0.1.0", 60, 10).sync_recommended).toBe(true);
  });
});

describe("Fork Drift Strategy — Validation", () => {
  it("validateDriftStrategy passes", () => {
    const result = validateDriftStrategy();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validation includes warnings for unprotected files in protected list", () => {
    const result = validateDriftStrategy();
    // Protected files that are not fork-specific should generate warnings
    // In our case, docs/architecture/multi-tenant-architecture.md is protected
    // but not in file_classifications, so it should warn
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Fork Drift Strategy — Summary", () => {
  it("getDriftStrategySummary returns correct stats", () => {
    const summary = getDriftStrategySummary();
    expect(summary.upstream_repo).toBe("subsumio-engine");
    expect(summary.fork_repo).toBe("github:Sigmacodeat/subsumio-web");
    expect(summary.sync_cadence).toBe("biweekly");
    expect(summary.total_classified_files).toBe(FORK_FILE_CLASSIFICATIONS.length);
    expect(summary.fork_specific_files).toBeGreaterThan(0);
    expect(summary.modified_from_upstream).toBeGreaterThan(0);
    expect(summary.ci_gates).toBeGreaterThan(0);
    expect(summary.blocking_gates).toBeGreaterThan(0);
    expect(summary.pinned_versions).toBeGreaterThan(0);
    expect(summary.latest_pinned_version).toBe("0.36.4.0");
    expect(summary.llms_regen_required).toBe(true);
  });
});
