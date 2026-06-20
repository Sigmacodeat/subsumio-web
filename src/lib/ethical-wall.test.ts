/**
 * Tests für Ethical-Wall & AI-Provider-Policy Enforcement — P0-ETHICS-002.
 */

import { describe, it, expect } from "vitest";
import {
  checkEthicalWall,
  checkPermissionWithEthicalWall,
  filterUsersByEthicalWall,
  PROVIDER_REGIONS,
  getDataResidencyRequirement,
  checkAiProviderPolicy,
  filterModelsByPrivilege,
  getDataResidencyForConfidentiality,
  getCombinedDataResidency,
  createEthicalWallAudit,
  type PermissionInfo,
} from "@/lib/ethical-wall";
import type { ModelEntry } from "@/lib/model-config";
import type { PrivilegeLevel, ConfidentialityLevel } from "@/lib/privilege-labels";

// ── Fixtures ──────────────────────────────────────────────────────────

function makePermission(overrides: Partial<PermissionInfo> = {}): PermissionInfo {
  return { visibility: "full", ...overrides };
}

function makeModel(overrides: Partial<ModelEntry> = {}): ModelEntry {
  return {
    id: "test-model",
    name: "Test Model",
    provider: "anthropic",
    contextWindow: 128_000,
    costPer1MInput: 1.0,
    costPer1MOutput: 5.0,
    speedRating: 4,
    description: "Test",
    capabilities: ["tool-use"],
    brainScoped: true,
    ...overrides,
  };
}

// ── checkEthicalWall ──────────────────────────────────────────────────

describe("checkEthicalWall", () => {
  it("allows when no permissions defined", () => {
    const result = checkEthicalWall("user-1", undefined);
    expect(result.allowed).toBe(true);
    expect(result.ethical_wall_active).toBe(false);
  });

  it("allows when user not in blocked_users", () => {
    const perm = makePermission({ blocked_users: ["user-2"] });
    const result = checkEthicalWall("user-1", perm);
    expect(result.allowed).toBe(true);
    expect(result.ethical_wall_active).toBe(true);
    expect(result.user_blocked).toBe(false);
  });

  it("denies when user is in blocked_users", () => {
    const perm = makePermission({ blocked_users: ["user-1", "user-2"] });
    const result = checkEthicalWall("user-1", perm);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("user_blocked_by_ethical_wall");
    expect(result.user_blocked).toBe(true);
  });

  it("allows when blocked_users is empty", () => {
    const perm = makePermission({ blocked_users: [] });
    const result = checkEthicalWall("user-1", perm);
    expect(result.allowed).toBe(true);
    expect(result.ethical_wall_active).toBe(false);
  });

  it("allows when blocked_users is undefined", () => {
    const perm = makePermission();
    const result = checkEthicalWall("user-1", perm);
    expect(result.allowed).toBe(true);
  });
});

// ── checkPermissionWithEthicalWall ────────────────────────────────────

describe("checkPermissionWithEthicalWall", () => {
  it("denies when ethical wall blocks even if RBAC allows", () => {
    const perm = makePermission({ blocked_users: ["user-1"] });
    const result = checkPermissionWithEthicalWall(true, "user-1", perm);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("user_blocked_by_ethical_wall");
    expect(result.rbac_allowed).toBe(true);
  });

  it("denies when RBAC denies even without ethical wall", () => {
    const result = checkPermissionWithEthicalWall(false, "user-1", undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("rbac_denied");
    expect(result.rbac_allowed).toBe(false);
  });

  it("allows when both RBAC and ethical wall pass", () => {
    const perm = makePermission({ blocked_users: ["user-2"] });
    const result = checkPermissionWithEthicalWall(true, "user-1", perm);
    expect(result.allowed).toBe(true);
    expect(result.rbac_allowed).toBe(true);
  });

  it("ethical wall takes precedence over RBAC", () => {
    const perm = makePermission({ blocked_users: ["user-1"] });
    const result = checkPermissionWithEthicalWall(false, "user-1", perm);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("user_blocked_by_ethical_wall");
  });
});

// ── filterUsersByEthicalWall ──────────────────────────────────────────

describe("filterUsersByEthicalWall", () => {
  it("allows all when no blocked_users", () => {
    const result = filterUsersByEthicalWall(["u1", "u2", "u3"], undefined);
    expect(result.allowed).toEqual(["u1", "u2", "u3"]);
    expect(result.blocked).toHaveLength(0);
  });

  it("filters out blocked users", () => {
    const perm = makePermission({ blocked_users: ["u2"] });
    const result = filterUsersByEthicalWall(["u1", "u2", "u3"], perm);
    expect(result.allowed).toEqual(["u1", "u3"]);
    expect(result.blocked).toEqual(["u2"]);
  });

  it("all blocked when all in blocked_users", () => {
    const perm = makePermission({ blocked_users: ["u1", "u2"] });
    const result = filterUsersByEthicalWall(["u1", "u2"], perm);
    expect(result.allowed).toHaveLength(0);
    expect(result.blocked).toHaveLength(2);
  });

  it("empty user list → empty results", () => {
    const perm = makePermission({ blocked_users: ["u1"] });
    const result = filterUsersByEthicalWall([], perm);
    expect(result.allowed).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
  });
});

// ── PROVIDER_REGIONS ──────────────────────────────────────────────────

describe("PROVIDER_REGIONS", () => {
  it("anthropic is US", () => {
    expect(PROVIDER_REGIONS.anthropic).toBe("us");
  });

  it("openai is US", () => {
    expect(PROVIDER_REGIONS.openai).toBe("us");
  });

  it("mistral is EU", () => {
    expect(PROVIDER_REGIONS.mistral).toBe("eu");
  });

  it("zero-entropy is EU", () => {
    expect(PROVIDER_REGIONS["zero-entropy"]).toBe("eu");
  });

  it("google is global", () => {
    expect(PROVIDER_REGIONS.google).toBe("global");
  });
});

// ── getDataResidencyRequirement ───────────────────────────────────────

describe("getDataResidencyRequirement", () => {
  it("attorney_client → eu_only", () => {
    expect(getDataResidencyRequirement("attorney_client")).toBe("eu_only");
  });

  it("work_product → eu_or_adequate", () => {
    expect(getDataResidencyRequirement("work_product")).toBe("eu_or_adequate");
  });

  it("joint_defense → eu_or_adequate", () => {
    expect(getDataResidencyRequirement("joint_defense")).toBe("eu_or_adequate");
  });

  it("none → none", () => {
    expect(getDataResidencyRequirement("none")).toBe("none");
  });
});

// ── checkAiProviderPolicy ─────────────────────────────────────────────

describe("checkAiProviderPolicy", () => {
  it("allows any provider for privilege=none", () => {
    expect(checkAiProviderPolicy("anthropic", "none").allowed).toBe(true);
    expect(checkAiProviderPolicy("openai", "none").allowed).toBe(true);
    expect(checkAiProviderPolicy("mistral", "none").allowed).toBe(true);
  });

  it("allows EU provider for attorney_client", () => {
    expect(checkAiProviderPolicy("mistral", "attorney_client").allowed).toBe(true);
    expect(checkAiProviderPolicy("zero-entropy", "attorney_client").allowed).toBe(true);
  });

  it("denies US provider for attorney_client", () => {
    const result = checkAiProviderPolicy("anthropic", "attorney_client");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("provider_not_in_eu_but_required");
  });

  it("denies openai for attorney_client", () => {
    const result = checkAiProviderPolicy("openai", "attorney_client");
    expect(result.allowed).toBe(false);
  });

  it("allows US provider for work_product (adequacy)", () => {
    expect(checkAiProviderPolicy("anthropic", "work_product").allowed).toBe(true);
    expect(checkAiProviderPolicy("openai", "work_product").allowed).toBe(true);
  });

  it("allows EU provider for work_product", () => {
    expect(checkAiProviderPolicy("mistral", "work_product").allowed).toBe(true);
  });

  it("allows global provider for work_product", () => {
    expect(checkAiProviderPolicy("google", "work_product").allowed).toBe(true);
  });
});

// ── filterModelsByPrivilege ───────────────────────────────────────────

describe("filterModelsByPrivilege", () => {
  const allModels: ModelEntry[] = [
    makeModel({ id: "claude", provider: "anthropic" }),
    makeModel({ id: "gpt", provider: "openai" }),
    makeModel({ id: "mistral", provider: "mistral" }),
    makeModel({ id: "ze", provider: "zero-entropy" }),
  ];

  it("allows all models for privilege=none", () => {
    const result = filterModelsByPrivilege(allModels, "none");
    expect(result.allowed).toHaveLength(4);
    expect(result.blocked).toHaveLength(0);
  });

  it("only EU models for attorney_client", () => {
    const result = filterModelsByPrivilege(allModels, "attorney_client");
    expect(result.allowed).toHaveLength(2);
    expect(result.allowed.map((m) => m.id)).toEqual(["mistral", "ze"]);
    expect(result.blocked).toHaveLength(2);
  });

  it("all models for work_product", () => {
    const result = filterModelsByPrivilege(allModels, "work_product");
    expect(result.allowed).toHaveLength(4);
  });
});

// ── getDataResidencyForConfidentiality ────────────────────────────────

describe("getDataResidencyForConfidentiality", () => {
  it("restricted → eu_only", () => {
    expect(getDataResidencyForConfidentiality("restricted")).toBe("eu_only");
  });

  it("confidential → eu_or_adequate", () => {
    expect(getDataResidencyForConfidentiality("confidential")).toBe("eu_or_adequate");
  });

  it("internal → none", () => {
    expect(getDataResidencyForConfidentiality("internal")).toBe("none");
  });

  it("public → none", () => {
    expect(getDataResidencyForConfidentiality("public")).toBe("none");
  });
});

// ── getCombinedDataResidency ──────────────────────────────────────────

describe("getCombinedDataResidency", () => {
  it("picks stricter of privilege and confidentiality", () => {
    expect(getCombinedDataResidency("attorney_client", "public")).toBe("eu_only");
    expect(getCombinedDataResidency("none", "restricted")).toBe("eu_only");
    expect(getCombinedDataResidency("work_product", "confidential")).toBe("eu_or_adequate");
    expect(getCombinedDataResidency("none", "public")).toBe("none");
  });

  it("attorney_client + restricted → eu_only", () => {
    expect(getCombinedDataResidency("attorney_client", "restricted")).toBe("eu_only");
  });

  it("work_product + internal → eu_or_adequate", () => {
    expect(getCombinedDataResidency("work_product", "internal")).toBe("eu_or_adequate");
  });
});

// ── createEthicalWallAudit ────────────────────────────────────────────

describe("createEthicalWallAudit", () => {
  it("creates audit entry for denied access", () => {
    const perm = makePermission({ blocked_users: ["user-1"] });
    const check = checkEthicalWall("user-1", perm);
    const audit = createEthicalWallAudit("user-1", "case.view", check, "cases/1");
    expect(audit.user_id).toBe("user-1");
    expect(audit.result).toBe("denied");
    expect(audit.reason).toBe("user_blocked_by_ethical_wall");
    expect(audit.ethical_wall_active).toBe(true);
    expect(audit.case_slug).toBe("cases/1");
    expect(audit.timestamp).toBeTruthy();
    expect(audit.id).toContain("user-1");
  });

  it("creates audit entry for allowed access", () => {
    const check = checkEthicalWall("user-1", undefined);
    const audit = createEthicalWallAudit("user-1", "case.view", check);
    expect(audit.result).toBe("allowed");
    expect(audit.ethical_wall_active).toBe(false);
  });
});
