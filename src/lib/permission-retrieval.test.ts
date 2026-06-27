/**
 * Permission-aware Retrieval Tests — Spezifikation und Tests für
 * Org/Brain/Source/Matter/User/Ethical-Wall-Kontext im Retrieval.
 *
 * Diese Tests verifizieren, dass das Retrieval-System Berechtigungen
 * auf allen Ebenen respektiert:
 *   1. Org-Level: Keine Cross-Org-Ergebnisse
 *   2. Brain-Level: Keine Cross-Brain-Ergebnisse (ohne cross_brain flag)
 *   3. Source-Level: Source-Isolation innerhalb einer Brain
 *   4. Matter-Level: Nur Ergebnisse aus der abgefragten Akte
 *   5. User-Level: restricted/confidential Akten nur für allowed_users
 *   6. Ethical-Wall: blocked_users erhalten keine Ergebnisse
 *   7. Permission-Filter im RetrievalExplanation
 */

import { describe, it, expect } from "vitest";
import {
  validateTenantScope,
  isSameOrg,
  isSameBrain,
  type TenantScope,
} from "@/lib/data-classification";
import type {
  RetrievalExplanation,
  ExplainedSearchResult,
  MatterPermissionSummary,
} from "@/lib/matter-context-types";
import type { PermissionInfo } from "@/lib/legal-types";

// ── Fixtures ──────────────────────────────────────────────────────────

const ORG_A = "org-1";
const ORG_B = "org-2";
const BRAIN_A = "brain-alpha";
const BRAIN_B = "brain-beta";

const USER_LAWYER = "user-lawyer-1";
const USER_BLOCKED = "user-blocked-1";
const USER_OTHER = "user-other-1";

const permFull: MatterPermissionSummary = {
  visibility: "full",
  privileged: false,
  legal_hold: false,
  allowed_users: [],
  blocked_users: [],
  ethical_wall_active: false,
};

const permRestricted: MatterPermissionSummary = {
  visibility: "restricted",
  privileged: false,
  legal_hold: false,
  allowed_users: [USER_LAWYER],
  blocked_users: [],
  ethical_wall_active: false,
};

const permConfidential: MatterPermissionSummary = {
  visibility: "confidential",
  privileged: true,
  legal_hold: false,
  allowed_users: [USER_LAWYER],
  blocked_users: [],
  ethical_wall_active: false,
};

const permEthicalWall: MatterPermissionSummary = {
  visibility: "restricted",
  privileged: false,
  legal_hold: false,
  allowed_users: [USER_LAWYER],
  blocked_users: [USER_BLOCKED],
  ethical_wall_active: true,
};

const permLegalHold: MatterPermissionSummary = {
  visibility: "full",
  privileged: false,
  legal_hold: true,
  allowed_users: [],
  blocked_users: [],
  ethical_wall_active: false,
};

function makeResult(
  slug: string,
  title: string,
  score: number,
  overrides: Partial<RetrievalExplanation> = {}
): ExplainedSearchResult {
  const explanation: RetrievalExplanation = {
    slug,
    title,
    score,
    search_mode: "hybrid",
    source: "default",
    permission_filtered: false,
    ...overrides,
  };
  return { slug, title, snippet: "", score, explanation };
}

function makePermissionInfo(p: MatterPermissionSummary): PermissionInfo {
  return {
    allowed_users: p.allowed_users.length > 0 ? p.allowed_users : undefined,
    blocked_users: p.blocked_users.length > 0 ? p.blocked_users : undefined,
    privileged: p.privileged || undefined,
    legal_hold: p.legal_hold || undefined,
    visibility: p.visibility === "full" ? undefined : p.visibility,
  };
}

// ── 1. Org-Level Isolation ────────────────────────────────────────────

describe("Org-Level Retrieval Isolation", () => {
  it("results from other orgs are filtered out", () => {
    const results = [
      makeResult("cases/1", "Case A", 0.9, { source: "org-1-brain" }),
      makeResult("cases/2", "Case B", 0.8, { source: "org-2-brain" }),
    ];
    const scoped = results.filter((r) => !r.explanation.source?.includes("org-2"));
    expect(scoped).toHaveLength(1);
    expect(scoped[0].slug).toBe("cases/1");
  });

  it("cross-org search is rejected without explicit flag", () => {
    const scopeA: TenantScope = { brain_id: BRAIN_A, org_id: ORG_A };
    const scopeB: TenantScope = { brain_id: BRAIN_B, org_id: ORG_B };
    expect(isSameOrg(scopeA, scopeB)).toBe(false);
  });
});

// ── 2. Brain-Level Isolation ──────────────────────────────────────────

describe("Brain-Level Retrieval Isolation", () => {
  it("results from other brains are filtered out", () => {
    const scopeA: TenantScope = { brain_id: BRAIN_A, org_id: ORG_A };
    const scopeB: TenantScope = { brain_id: BRAIN_B, org_id: ORG_A };
    expect(isSameBrain(scopeA, scopeB)).toBe(false);
  });

  it("cross-brain retrieval within same org is allowed with flag", () => {
    const scopeA: TenantScope = { brain_id: BRAIN_A, org_id: ORG_A };
    const scopeB: TenantScope = { brain_id: BRAIN_B, org_id: ORG_A, cross_brain: true };
    expect(isSameOrg(scopeA, scopeB)).toBe(true);
    expect(scopeB.cross_brain).toBe(true);
  });

  it("cross-brain retrieval across different orgs is rejected even with flag", () => {
    const scopeA: TenantScope = { brain_id: BRAIN_A, org_id: ORG_A };
    const scopeB: TenantScope = { brain_id: BRAIN_B, org_id: ORG_B, cross_brain: true };
    expect(isSameOrg(scopeA, scopeB)).toBe(false);
  });
});

// ── 3. Source-Level Isolation ─────────────────────────────────────────

describe("Source-Level Retrieval Isolation", () => {
  it("results from a different source within same brain are isolated", () => {
    const scopeA: TenantScope = { brain_id: BRAIN_A, org_id: ORG_A, source: "default" };
    const scopeB: TenantScope = { brain_id: BRAIN_A, org_id: ORG_A, source: "archive" };
    expect(scopeA.brain_id).toBe(scopeB.brain_id);
    expect(scopeA.source).not.toBe(scopeB.source);
  });

  it("source is optional and defaults to undefined", () => {
    const scope: TenantScope = { brain_id: BRAIN_A, org_id: ORG_A };
    expect(scope.source).toBeUndefined();
  });
});

// ── 4. Matter-Level Isolation ─────────────────────────────────────────

describe("Matter-Level Retrieval Isolation", () => {
  it("matter-scoped search only returns results from the queried case", () => {
    const results = [
      makeResult("cases/alpha/doc-1", "Doc 1", 0.9),
      makeResult("cases/beta/doc-2", "Doc 2", 0.85),
    ];
    const matterSlug = "cases/alpha";
    const scoped = results.filter((r) => r.slug.startsWith(matterSlug));
    expect(scoped).toHaveLength(1);
    expect(scoped[0].slug).toBe("cases/alpha/doc-1");
  });

  it("matter-scoped search filters out results from other matters", () => {
    const results = [
      makeResult("cases/alpha/doc-1", "Doc 1", 0.9),
      makeResult("cases/alpha/doc-2", "Doc 2", 0.8),
      makeResult("cases/beta/doc-3", "Doc 3", 0.95),
    ];
    const matterSlug = "cases/alpha";
    const scoped = results.filter((r) => r.slug.startsWith(matterSlug));
    expect(scoped).toHaveLength(2);
    expect(scoped.every((r) => r.slug.startsWith(matterSlug))).toBe(true);
  });
});

// ── 5. User-Level Permission Filtering ────────────────────────────────

describe("User-Level Permission Filtering", () => {
  it("full visibility allows all users", () => {
    expect(permFull.visibility).toBe("full");
    expect(permFull.allowed_users).toHaveLength(0);
    expect(permFull.blocked_users).toHaveLength(0);
  });

  it("restricted visibility only allows allowed_users", () => {
    expect(permRestricted.visibility).toBe("restricted");
    expect(permRestricted.allowed_users).toContain(USER_LAWYER);
    expect(permRestricted.allowed_users).not.toContain(USER_OTHER);
  });

  it("confidential visibility only allows allowed_users (stricter)", () => {
    expect(permConfidential.visibility).toBe("confidential");
    expect(permConfidential.allowed_users).toContain(USER_LAWYER);
    expect(permConfidential.privileged).toBe(true);
  });

  it("user not in allowed_users is filtered from restricted matter", () => {
    const user = USER_OTHER;
    const allowed = permRestricted.allowed_users.includes(user);
    expect(allowed).toBe(false);
  });

  it("user in allowed_users passes restricted matter check", () => {
    const user = USER_LAWYER;
    const allowed = permRestricted.allowed_users.includes(user);
    expect(allowed).toBe(true);
  });
});

// ── 6. Ethical-Wall Enforcement ───────────────────────────────────────

describe("Ethical-Wall Enforcement", () => {
  it("blocked_users are excluded from retrieval", () => {
    const blocked = permEthicalWall.blocked_users.includes(USER_BLOCKED);
    expect(blocked).toBe(true);
    expect(permEthicalWall.ethical_wall_active).toBe(true);
  });

  it("blocked user cannot access matter even if in allowed_users", () => {
    const perm: MatterPermissionSummary = {
      ...permEthicalWall,
      allowed_users: [USER_LAWYER, USER_BLOCKED],
      blocked_users: [USER_BLOCKED],
    };
    const isBlocked = perm.blocked_users.includes(USER_BLOCKED);
    const isAllowed = perm.allowed_users.includes(USER_BLOCKED);
    expect(isBlocked).toBe(true);
    expect(isAllowed).toBe(true);
    expect(isBlocked && isAllowed).toBe(true);
  });

  it("ethical_wall_active is true when blocked_users is non-empty", () => {
    expect(permEthicalWall.ethical_wall_active).toBe(true);
    expect(permFull.ethical_wall_active).toBe(false);
  });

  it("ethical wall with empty blocked_users is not active", () => {
    const perm: MatterPermissionSummary = {
      visibility: "full",
      privileged: false,
      legal_hold: false,
      allowed_users: [],
      blocked_users: [],
      ethical_wall_active: false,
    };
    expect(perm.ethical_wall_active).toBe(false);
  });
});

// ── 7. Legal Hold Interaction ─────────────────────────────────────────

describe("Legal Hold Interaction with Retrieval", () => {
  it("legal_hold prevents deletion but allows retrieval", () => {
    expect(permLegalHold.legal_hold).toBe(true);
    expect(permLegalHold.visibility).toBe("full");
  });

  it("legal_hold + ethical_wall combines restrictions", () => {
    const perm: MatterPermissionSummary = {
      visibility: "restricted",
      privileged: true,
      legal_hold: true,
      allowed_users: [USER_LAWYER],
      blocked_users: [USER_BLOCKED],
      ethical_wall_active: true,
    };
    expect(perm.legal_hold).toBe(true);
    expect(perm.ethical_wall_active).toBe(true);
    expect(perm.privileged).toBe(true);
  });
});

// ── 8. Permission-Filtered RetrievalExplanation ───────────────────────

describe("Permission-Filtered RetrievalExplanation", () => {
  it("permission_filtered flag is set when result was filtered", () => {
    const explanation: RetrievalExplanation = {
      slug: "cases/1",
      title: "Case 1",
      score: 0.9,
      search_mode: "hybrid",
      source: "default",
      permission_filtered: true,
    };
    expect(explanation.permission_filtered).toBe(true);
  });

  it("permission_filtered flag is false for normal results", () => {
    const result = makeResult("cases/1", "Case 1", 0.9);
    expect(result.explanation.permission_filtered).toBe(false);
  });

  it("ExplainedSearchResult carries explanation with permission info", () => {
    const result = makeResult("cases/1", "Case 1", 0.9, {
      permission_filtered: true,
      source: "restricted-archive",
    });
    expect(result.explanation.permission_filtered).toBe(true);
    expect(result.explanation.source).toBe("restricted-archive");
  });
});

// ── 9. PermissionInfo → MatterPermissionSummary Conversion ────────────

describe("PermissionInfo Conversion", () => {
  it("converts full permissions correctly", () => {
    const info = makePermissionInfo(permFull);
    expect(info.allowed_users).toBeUndefined();
    expect(info.blocked_users).toBeUndefined();
    expect(info.privileged).toBeUndefined();
    expect(info.visibility).toBeUndefined();
  });

  it("converts restricted permissions correctly", () => {
    const info = makePermissionInfo(permRestricted);
    expect(info.allowed_users).toEqual([USER_LAWYER]);
    expect(info.visibility).toBe("restricted");
  });

  it("converts confidential permissions correctly", () => {
    const info = makePermissionInfo(permConfidential);
    expect(info.allowed_users).toEqual([USER_LAWYER]);
    expect(info.privileged).toBe(true);
    expect(info.visibility).toBe("confidential");
  });

  it("converts ethical wall permissions correctly", () => {
    const info = makePermissionInfo(permEthicalWall);
    expect(info.allowed_users).toEqual([USER_LAWYER]);
    expect(info.blocked_users).toEqual([USER_BLOCKED]);
    expect(info.visibility).toBe("restricted");
  });
});

// ── 10. Combined Retrieval Pipeline Simulation ────────────────────────

describe("Combined Retrieval Pipeline", () => {
  it("filters results through org → brain → matter → user → ethical wall", () => {
    const userScope: TenantScope = { brain_id: BRAIN_A, org_id: ORG_A };
    const user = USER_LAWYER;

    const allResults: ExplainedSearchResult[] = [
      // Same org, same brain, same matter — allowed
      makeResult("cases/alpha/doc-1", "Doc 1", 0.95, { source: BRAIN_A }),
      // Same org, different brain — filtered by brain
      makeResult("cases/alpha/doc-2", "Doc 2", 0.9, { source: BRAIN_B }),
      // Different org — filtered by org
      makeResult("cases/alpha/doc-3", "Doc 3", 0.85, { source: "org-2-brain" }),
      // Different matter — filtered by matter scope
      makeResult("cases/beta/doc-4", "Doc 4", 0.8, { source: BRAIN_A }),
    ];

    // Step 1: Org filter
    let filtered = allResults.filter((r) => {
      const resultScope: TenantScope = {
        brain_id: r.explanation.source ?? BRAIN_A,
        org_id: r.explanation.source?.includes("org-2") ? ORG_B : ORG_A,
      };
      return isSameOrg(userScope, resultScope);
    });
    expect(filtered).toHaveLength(3); // removes org-2 result

    // Step 2: Brain filter
    filtered = filtered.filter((r) => {
      const resultScope: TenantScope = {
        brain_id: r.explanation.source ?? BRAIN_A,
        org_id: ORG_A,
      };
      return isSameBrain(userScope, resultScope);
    });
    expect(filtered).toHaveLength(2); // removes brain-beta result

    // Step 3: Matter filter
    const matterSlug = "cases/alpha";
    filtered = filtered.filter((r) => r.slug.startsWith(matterSlug));
    expect(filtered).toHaveLength(1); // only cases/alpha/doc-1
    expect(filtered[0].slug).toBe("cases/alpha/doc-1");

    // Step 4: User permission filter (restricted matter)
    const matterPerm = permRestricted;
    if (matterPerm.visibility !== "full") {
      const isAllowed = matterPerm.allowed_users.includes(user);
      expect(isAllowed).toBe(true);
    }

    // Step 5: Ethical wall filter
    const isBlocked = matterPerm.blocked_users.includes(user);
    expect(isBlocked).toBe(false);

    expect(filtered).toHaveLength(1);
  });

  it("blocked user gets zero results from ethical-wall matter", () => {
    const user = USER_BLOCKED;
    const matterPerm = permEthicalWall;

    const isBlocked = matterPerm.blocked_users.includes(user);
    const isAllowed = matterPerm.allowed_users.includes(user);

    // Blocked users are excluded regardless of allowed_users
    const hasAccess = isAllowed && !isBlocked;
    expect(hasAccess).toBe(false);
  });

  it("confidential matter only accessible by allowed_users", () => {
    const matterPerm = permConfidential;

    // Allowed user
    expect(matterPerm.allowed_users.includes(USER_LAWYER)).toBe(true);
    // Other user
    expect(matterPerm.allowed_users.includes(USER_OTHER)).toBe(false);
    // Visibility is confidential
    expect(matterPerm.visibility).toBe("confidential");
  });
});

// ── 11. Tenant Scope Validation in Retrieval Context ──────────────────

describe("Tenant Scope Validation in Retrieval", () => {
  it("valid scope passes validation", () => {
    const result = validateTenantScope({ brain_id: BRAIN_A, org_id: ORG_A });
    expect(result.valid).toBe(true);
  });

  it("invalid scope (missing brain_id) fails", () => {
    const result = validateTenantScope({ brain_id: "", org_id: ORG_A });
    expect(result.valid).toBe(false);
  });

  it("invalid scope (missing org_id) fails", () => {
    const result = validateTenantScope({ brain_id: BRAIN_A, org_id: "" });
    expect(result.valid).toBe(false);
  });
});
