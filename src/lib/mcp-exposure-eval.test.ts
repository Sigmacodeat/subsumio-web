import { describe, it, expect } from "vitest";
import {
  LEGAL_MCP_OPERATIONS,
  TRUST_BOUNDARY_CHECKS,
  evaluateMcpExposure,
  getOperationRisk,
  getExposedOperations,
  getMutatingExposedOperations,
  getReadOperations,
  getProtectedOperations,
  getUnsafeOperations,
  getFailedTrustChecks,
  getTrustChecksBySeverity,
  getMcpExposureSummary,
} from "@/lib/mcp-exposure-eval";

describe("MCP Exposure Eval — Operations Registry", () => {
  it("has 12+ operations in registry", () => {
    expect(LEGAL_MCP_OPERATIONS.length).toBeGreaterThanOrEqual(12);
  });

  it("every operation has required fields", () => {
    for (const op of LEGAL_MCP_OPERATIONS) {
      expect(op.op_name).toBeTruthy();
      expect(op.description).toBeTruthy();
      expect(op.risk).toBeTruthy();
      expect(op.status).toBeTruthy();
    }
  });

  it("has unique operation names", () => {
    const names = LEGAL_MCP_OPERATIONS.map((o) => o.op_name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes query operation", () => {
    const query = getOperationRisk("query");
    expect(query).toBeDefined();
    expect(query!.exposed).toBe(true);
    expect(query!.mutating).toBe(false);
  });

  it("includes file_upload operation", () => {
    const upload = getOperationRisk("file_upload");
    expect(upload).toBeDefined();
    expect(upload!.exposed).toBe(true);
    expect(upload!.mutating).toBe(true);
  });

  it("marks protected operations as not exposed", () => {
    const synthesize = getOperationRisk("synthesize");
    expect(synthesize).toBeDefined();
    expect(synthesize!.exposed).toBe(false);
    expect(synthesize!.status).toBe("not_exposed");
  });
});

describe("MCP Exposure Eval — Trust Boundary Checks", () => {
  it("has 10+ trust boundary checks", () => {
    expect(TRUST_BOUNDARY_CHECKS.length).toBeGreaterThanOrEqual(10);
  });

  it("every check has required fields", () => {
    for (const check of TRUST_BOUNDARY_CHECKS) {
      expect(check.check_name).toBeTruthy();
      expect(check.description).toBeTruthy();
      expect(typeof check.passed).toBe("boolean");
      expect(check.severity).toBeTruthy();
    }
  });

  it("has unique check names", () => {
    const names = TRUST_BOUNDARY_CHECKS.map((c) => c.check_name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes remote_default_true check", () => {
    const check = TRUST_BOUNDARY_CHECKS.find((c) => c.check_name === "remote_default_true");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
    expect(check!.severity).toBe("critical");
  });

  it("includes protected_ops_blocked check", () => {
    const check = TRUST_BOUNDARY_CHECKS.find((c) => c.check_name === "protected_ops_blocked");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
    expect(check!.severity).toBe("critical");
  });

  it("includes matter_scope_optional check (not passed)", () => {
    const check = TRUST_BOUNDARY_CHECKS.find((c) => c.check_name === "matter_scope_optional");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });
});

describe("MCP Exposure Eval — Evaluation", () => {
  it("evaluateMcpExposure returns complete evaluation", () => {
    const eval_ = evaluateMcpExposure();
    expect(eval_.total_operations).toBe(LEGAL_MCP_OPERATIONS.length);
    expect(eval_.operations).toBeDefined();
    expect(eval_.trust_boundary_checks).toBeDefined();
    expect(eval_.required_filters_summary).toBeDefined();
    expect(eval_.recommendations).toBeDefined();
    expect(eval_.evaluated_at).toBeTruthy();
  });

  it("counts exposed operations correctly", () => {
    const eval_ = evaluateMcpExposure();
    expect(eval_.exposed_operations).toBeGreaterThan(0);
    expect(eval_.exposed_operations).toBe(getExposedOperations().length);
  });

  it("counts safe operations correctly", () => {
    const eval_ = evaluateMcpExposure();
    expect(eval_.safe_operations).toBeGreaterThan(0);
  });

  it("has zero unsafe operations", () => {
    const eval_ = evaluateMcpExposure();
    expect(eval_.unsafe_operations).toBe(0);
  });

  it("overall status is safe or safe_with_filters", () => {
    const eval_ = evaluateMcpExposure();
    expect(["safe", "safe_with_filters"]).toContain(eval_.overall_status);
  });

  it("includes recommendations", () => {
    const eval_ = evaluateMcpExposure();
    expect(eval_.recommendations.length).toBeGreaterThan(0);
  });

  it("recommendations include matter_scope guidance", () => {
    const eval_ = evaluateMcpExposure();
    expect(eval_.recommendations.some((r) => r.includes("Matter-Scoping"))).toBe(true);
  });

  it("required_filters_summary is non-empty", () => {
    const eval_ = evaluateMcpExposure();
    expect(eval_.required_filters_summary.length).toBeGreaterThan(0);
  });
});

describe("MCP Exposure Eval — Lookup", () => {
  it("getOperationRisk returns matching op", () => {
    const op = getOperationRisk("query");
    expect(op).toBeDefined();
    expect(op!.op_name).toBe("query");
  });

  it("getOperationRisk returns undefined for unknown", () => {
    expect(getOperationRisk("nonexistent")).toBeUndefined();
  });

  it("getExposedOperations returns only exposed", () => {
    const exposed = getExposedOperations();
    expect(exposed.every((o) => o.exposed)).toBe(true);
  });

  it("getMutatingExposedOperations returns only mutating+exposed", () => {
    const mutating = getMutatingExposedOperations();
    expect(mutating.every((o) => o.exposed && o.mutating)).toBe(true);
  });

  it("getReadOperations returns only read+exposed", () => {
    const read = getReadOperations();
    expect(read.every((o) => o.exposed && !o.mutating)).toBe(true);
  });

  it("getProtectedOperations returns only not-exposed", () => {
    const protected_ = getProtectedOperations();
    expect(protected_.every((o) => !o.exposed)).toBe(true);
  });

  it("getUnsafeOperations returns empty list", () => {
    expect(getUnsafeOperations()).toHaveLength(0);
  });

  it("getFailedTrustChecks returns matter_scope_optional", () => {
    const failed = getFailedTrustChecks();
    expect(failed.some((c) => c.check_name === "matter_scope_optional")).toBe(true);
  });

  it("getTrustChecksBySeverity filters correctly", () => {
    const critical = getTrustChecksBySeverity("critical");
    expect(critical.every((c) => c.severity === "critical")).toBe(true);
    expect(critical.length).toBeGreaterThan(0);
  });
});

describe("MCP Exposure Eval — Summary", () => {
  it("getMcpExposureSummary returns correct stats", () => {
    const summary = getMcpExposureSummary();
    expect(summary.total_operations).toBe(LEGAL_MCP_OPERATIONS.length);
    expect(summary.exposed).toBeGreaterThan(0);
    expect(summary.not_exposed).toBeGreaterThan(0);
    expect(summary.read_ops).toBeGreaterThan(0);
    expect(summary.mutating_ops).toBeGreaterThan(0);
    expect(summary.protected_ops).toBeGreaterThan(0);
  });

  it("summary trust checks counts are correct", () => {
    const summary = getMcpExposureSummary();
    expect(summary.trust_checks_total).toBe(TRUST_BOUNDARY_CHECKS.length);
    expect(summary.trust_checks_passed + summary.trust_checks_failed).toBe(summary.trust_checks_total);
  });

  it("summary has zero unsafe operations", () => {
    const summary = getMcpExposureSummary();
    expect(summary.unsafe).toBe(0);
  });

  it("summary overall_status matches evaluation", () => {
    const eval_ = evaluateMcpExposure();
    const summary = getMcpExposureSummary();
    expect(summary.overall_status).toBe(eval_.overall_status);
  });
});

describe("MCP Exposure Eval — Specific Operation Checks", () => {
  it("query has tenant + privilege + ethical_wall filters", () => {
    const query = getOperationRisk("query")!;
    const filterTypes = query.required_filters.map((f) => f.filter_type);
    expect(filterTypes).toContain("tenant");
    expect(filterTypes).toContain("privilege");
    expect(filterTypes).toContain("ethical_wall");
  });

  it("file_upload has input_validation filter", () => {
    const upload = getOperationRisk("file_upload")!;
    const filterTypes = upload.required_filters.map((f) => f.filter_type);
    expect(filterTypes).toContain("input_validation");
  });

  it("forget_fact has privilege filter (legal hold)", () => {
    const forget = getOperationRisk("forget_fact")!;
    const filterTypes = forget.required_filters.map((f) => f.filter_type);
    expect(filterTypes).toContain("privilege");
  });

  it("all exposed operations have tenant filter", () => {
    const exposed = getExposedOperations();
    for (const op of exposed) {
      const hasTenant = op.required_filters.some((f) => f.filter_type === "tenant");
      expect(hasTenant).toBe(true);
    }
  });

  it("all exposed operations are audited", () => {
    const exposed = getExposedOperations();
    for (const op of exposed) {
      expect(op.audited).toBe(true);
    }
  });

  it("all mutating exposed operations have high or critical risk", () => {
    const mutating = getMutatingExposedOperations();
    for (const op of mutating) {
      expect(["high", "critical"]).toContain(op.risk);
    }
  });

  it("protected operations have critical risk", () => {
    const protected_ = getProtectedOperations();
    for (const op of protected_) {
      expect(op.risk).toBe("critical");
    }
  });
});
