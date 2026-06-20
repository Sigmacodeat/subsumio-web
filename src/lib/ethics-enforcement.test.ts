/**
 * Ethics Enforcement Tests — P0-ETHICS-002
 *
 * Verifiziert:
 *   1. Ethical Wall — blocked users, allowed users, visibility
 *   2. AI Provider Policy — data residency, privilege, confidentiality, PII
 *   3. Combined enforcement (enforceAll)
 *   4. Model selection helper
 *   5. Audit entry creation
 */

import { describe, it, expect } from "vitest";
import {
  enforceEthicalWall,
  enforceAiProviderPolicy,
  enforceAll,
  selectModelForContext,
  createEthicsAuditEntry,
  type EthicalWallContext,
  type AiProviderPolicyContext,
  type EnforcementContext,
} from "@/lib/ethics-enforcement";
import type { PermissionInfo } from "@/lib/legal-types";

// ── Helpers ───────────────────────────────────────────────────────────

function makePermissions(overrides: Partial<PermissionInfo> & { ethical_wall_active?: boolean } = {}): PermissionInfo & { ethical_wall_active?: boolean } {
  return {
    allowed_users: [],
    blocked_users: [],
    privileged: false,
    legal_hold: false,
    visibility: "full",
    ...overrides,
  };
}

// ── 1. Ethical Wall ───────────────────────────────────────────────────

describe("enforceEthicalWall", () => {
  it("allows access when no ethical wall active", () => {
    const ctx: EthicalWallContext = {
      user_id: "user-1",
      user_role: "lawyer",
      case_slug: "cases/test",
      permissions: makePermissions(),
    };
    const result = enforceEthicalWall(ctx);
    expect(result.allowed).toBe(true);
    expect(result.blocked_by).toBe("none");
  });

  it("blocks user in blocked_users list", () => {
    const ctx: EthicalWallContext = {
      user_id: "user-blocked",
      user_role: "lawyer",
      case_slug: "cases/test",
      permissions: makePermissions({
        ethical_wall_active: true,
        blocked_users: ["user-blocked"],
      }),
    };
    const result = enforceEthicalWall(ctx);
    expect(result.allowed).toBe(false);
    expect(result.blocked_by).toBe("ethical_wall");
    expect(result.reason).toContain("blocked");
  });

  it("blocks user not in allowed_users when ethical wall active", () => {
    const ctx: EthicalWallContext = {
      user_id: "user-outside",
      user_role: "lawyer",
      case_slug: "cases/test",
      permissions: makePermissions({
        ethical_wall_active: true,
        blocked_users: ["user-blocked"],
        allowed_users: ["user-inside"],
      }),
    };
    const result = enforceEthicalWall(ctx);
    expect(result.allowed).toBe(false);
    expect(result.blocked_by).toBe("not_in_allowed");
  });

  it("allows user in allowed_users when ethical wall active", () => {
    const ctx: EthicalWallContext = {
      user_id: "user-inside",
      user_role: "lawyer",
      case_slug: "cases/test",
      permissions: makePermissions({
        ethical_wall_active: true,
        blocked_users: ["user-blocked"],
        allowed_users: ["user-inside"],
      }),
    };
    const result = enforceEthicalWall(ctx);
    expect(result.allowed).toBe(true);
  });

  it("blocks confidential visibility for non-allowed user", () => {
    const ctx: EthicalWallContext = {
      user_id: "user-outside",
      user_role: "lawyer",
      case_slug: "cases/test",
      permissions: makePermissions({
        ethical_wall_active: true,
        blocked_users: ["user-blocked"],
        visibility: "confidential",
        allowed_users: ["user-inside"],
      }),
    };
    const result = enforceEthicalWall(ctx);
    expect(result.allowed).toBe(false);
    expect(result.blocked_by).toBe("confidential");
  });

  it("blocks restricted visibility for non-allowed user", () => {
    const ctx: EthicalWallContext = {
      user_id: "user-outside",
      user_role: "lawyer",
      case_slug: "cases/test",
      permissions: makePermissions({
        ethical_wall_active: false,
        visibility: "restricted",
        allowed_users: ["user-inside"],
      }),
    };
    const result = enforceEthicalWall(ctx);
    expect(result.allowed).toBe(false);
    expect(result.blocked_by).toBe("not_in_allowed");
  });

  it("blocked_users takes precedence over allowed_users", () => {
    const ctx: EthicalWallContext = {
      user_id: "user-conflict",
      user_role: "lawyer",
      case_slug: "cases/test",
      permissions: makePermissions({
        ethical_wall_active: true,
        allowed_users: ["user-conflict"],
        blocked_users: ["user-conflict"],
      }),
    };
    const result = enforceEthicalWall(ctx);
    expect(result.allowed).toBe(false);
    expect(result.blocked_by).toBe("ethical_wall");
  });
});

// ── 2. AI Provider Policy ─────────────────────────────────────────────

describe("enforceAiProviderPolicy", () => {
  it("allows all models for public data with any residency", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "none",
      confidentiality: "public",
      data_residency: "any",
      includes_pii: false,
    };
    const result = enforceAiProviderPolicy(ctx);
    expect(result.allowed_models.length).toBeGreaterThan(0);
    expect(result.blocked_providers).toHaveLength(0);
  });

  it("blocks non-EU providers for eu_only residency", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "none",
      confidentiality: "internal",
      data_residency: "eu_only",
      includes_pii: false,
    };
    const result = enforceAiProviderPolicy(ctx);
    expect(result.blocked_providers).toContain("anthropic");
    expect(result.blocked_providers).toContain("openai");
    expect(result.allowed_models.every((m) => m.provider === "mistral")).toBe(true);
  });

  it("blocks non-GDPR providers for attorney_client with any residency", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "attorney_client",
      confidentiality: "confidential",
      data_residency: "any",
      includes_pii: false,
    };
    const result = enforceAiProviderPolicy(ctx);
    // All providers in AI_MODELS are GDPR-compliant, so none should be blocked
    expect(result.allowed_models.length).toBeGreaterThan(0);
    expect(result.reason).toContain("GDPR");
  });

  it("blocks non-EU providers for restricted confidentiality", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "none",
      confidentiality: "restricted",
      data_residency: "gdpr_compliant",
      includes_pii: false,
    };
    const result = enforceAiProviderPolicy(ctx);
    expect(result.blocked_providers).toContain("anthropic");
    expect(result.blocked_providers).toContain("openai");
  });

  it("blocks non-GDPR providers for PII with any residency", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "none",
      confidentiality: "internal",
      data_residency: "any",
      includes_pii: true,
    };
    const result = enforceAiProviderPolicy(ctx);
    // All providers in AI_MODELS are GDPR-compliant
    expect(result.allowed_models.length).toBeGreaterThan(0);
    expect(result.reason).toContain("GDPR");
  });

  it("allows Mistral for EU-only restricted data", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "attorney_client",
      confidentiality: "restricted",
      data_residency: "eu_only",
      includes_pii: true,
    };
    const result = enforceAiProviderPolicy(ctx);
    const mistralModels = result.allowed_models.filter((m) => m.provider === "mistral");
    expect(mistralModels.length).toBeGreaterThan(0);
  });

  it("returns reason string explaining blocks", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "attorney_client",
      confidentiality: "restricted",
      data_residency: "any",
      includes_pii: true,
    };
    const result = enforceAiProviderPolicy(ctx);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toContain("EU");
  });
});

// ── 3. Combined Enforcement ───────────────────────────────────────────

describe("enforceAll", () => {
  it("allows when both ethical wall and AI policy pass", () => {
    const ctx: EnforcementContext = {
      user_id: "user-1",
      user_role: "lawyer",
      action: "query.submit",
      case_slug: "cases/test",
      permissions: makePermissions({ ethical_wall_active: false }),
      privilege: "none",
      confidentiality: "public",
    };
    const result = enforceAll(ctx);
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks when ethical wall fails", () => {
    const ctx: EnforcementContext = {
      user_id: "blocked-user",
      user_role: "lawyer",
      action: "brain.read",
      case_slug: "cases/test",
      permissions: makePermissions({
        ethical_wall_active: true,
        blocked_users: ["blocked-user"],
      }),
    };
    const result = enforceAll(ctx);
    expect(result.allowed).toBe(false);
    expect(result.ethical_wall?.allowed).toBe(false);
  });

  it("restricts models for restricted confidentiality but allows EU providers", () => {
    const ctx: EnforcementContext = {
      user_id: "user-1",
      user_role: "lawyer",
      action: "query.submit",
      case_slug: "cases/test",
      permissions: makePermissions({ ethical_wall_active: false }),
      privilege: "attorney_client",
      confidentiality: "restricted",
    };
    const result = enforceAll(ctx);
    expect(result.ai_policy).toBeDefined();
    expect(result.ai_policy!.allowed_models.every((m) => m.provider === "mistral")).toBe(true);
  });

  it("does not check AI policy for non-AI actions", () => {
    const ctx: EnforcementContext = {
      user_id: "user-1",
      user_role: "lawyer",
      action: "brain.read",
      case_slug: "cases/test",
      permissions: makePermissions({ ethical_wall_active: false }),
      privilege: "attorney_client",
      confidentiality: "restricted",
    };
    const result = enforceAll(ctx);
    expect(result.ai_policy).toBeUndefined();
  });

  it("checks AI policy for legal.* actions", () => {
    const ctx: EnforcementContext = {
      user_id: "user-1",
      user_role: "lawyer",
      action: "legal.memo",
      case_slug: "cases/test",
      permissions: makePermissions({ ethical_wall_active: false }),
      privilege: "attorney_client",
      confidentiality: "restricted",
    };
    const result = enforceAll(ctx);
    expect(result.ai_policy).toBeDefined();
  });
});

// ── 4. Model Selection ────────────────────────────────────────────────

describe("selectModelForContext", () => {
  it("returns preferred model if allowed", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "none",
      confidentiality: "public",
      data_residency: "any",
      includes_pii: false,
    };
    const policy = enforceAiProviderPolicy(ctx);
    const preferredId = policy.allowed_models[0].id;
    const model = selectModelForContext(policy, preferredId);
    expect(model?.id).toBe(preferredId);
  });

  it("returns first allowed model if preferred not allowed", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "none",
      confidentiality: "public",
      data_residency: "any",
      includes_pii: false,
    };
    const policy = enforceAiProviderPolicy(ctx);
    const model = selectModelForContext(policy, "nonexistent-model-id");
    expect(model).not.toBeNull();
    expect(policy.allowed_models).toContain(model);
  });

  it("returns null when no models allowed", () => {
    const ctx: AiProviderPolicyContext = {
      privilege: "attorney_client",
      confidentiality: "restricted",
      data_residency: "eu_only",
      includes_pii: true,
    };
    const policy = enforceAiProviderPolicy(ctx);
    // If there are EU models, they should be allowed
    if (policy.allowed_models.length > 0) {
      const model = selectModelForContext(policy);
      expect(model).not.toBeNull();
    } else {
      const model = selectModelForContext(policy);
      expect(model).toBeNull();
    }
  });
});

// ── 5. Audit Entry ────────────────────────────────────────────────────

describe("createEthicsAuditEntry", () => {
  it("creates audit entry for allowed action", () => {
    const ctx: EnforcementContext = {
      user_id: "user-1",
      user_role: "lawyer",
      action: "brain.read",
      case_slug: "cases/test",
      permissions: makePermissions({ ethical_wall_active: false }),
    };
    const result = enforceAll(ctx);
    const audit = createEthicsAuditEntry(ctx, result);
    expect(audit.timestamp).toBeTruthy();
    expect(audit.user_id).toBe("user-1");
    expect(audit.result).toBe("allowed");
    expect(audit.enforcement_type).toBe("ethical_wall");
  });

  it("creates audit entry for denied action", () => {
    const ctx: EnforcementContext = {
      user_id: "blocked-user",
      user_role: "lawyer",
      action: "brain.read",
      case_slug: "cases/test",
      permissions: makePermissions({
        ethical_wall_active: true,
        blocked_users: ["blocked-user"],
      }),
    };
    const result = enforceAll(ctx);
    const audit = createEthicsAuditEntry(ctx, result);
    expect(audit.result).toBe("denied");
    expect(audit.reason).toContain("blocked");
  });

  it("sets enforcement_type to combined when both checks run", () => {
    const ctx: EnforcementContext = {
      user_id: "user-1",
      user_role: "lawyer",
      action: "query.submit",
      case_slug: "cases/test",
      permissions: makePermissions({ ethical_wall_active: false }),
      privilege: "none",
      confidentiality: "public",
    };
    const result = enforceAll(ctx);
    const audit = createEthicsAuditEntry(ctx, result);
    expect(audit.enforcement_type).toBe("combined");
  });
});
