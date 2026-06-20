// @vitest-environment node

import { describe, test, expect, expectTypeOf } from "vitest";
import {
  createTenantGuard,
  TenantViolationError,
  type TenantGuard,
  type ScopedResult,
} from "@/lib/tenant-guard";
import type { MatterPermissionSummary } from "@/lib/matter-context-types";

// ── Fixtures ──────────────────────────────────────────────────────────

const ORG_A = "org-1";
const ORG_B = "org-2";
const BRAIN_A = "brain-alpha";
const BRAIN_B = "brain-beta";
const BRAIN_A2 = "brain-alpha-2"; // Same org, different brain
const USER_1 = "user-1";
const USER_2 = "user-2";
const USER_BLOCKED = "user-blocked";

const guardA = createTenantGuard({ brainId: BRAIN_A, orgId: ORG_A, userId: USER_1 });
const guardB = createTenantGuard({ brainId: BRAIN_B, orgId: ORG_B, userId: USER_2 });

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
  allowed_users: [USER_1],
  blocked_users: [],
  ethical_wall_active: false,
};

const permEthicalWall: MatterPermissionSummary = {
  visibility: "restricted",
  privileged: false,
  legal_hold: false,
  allowed_users: [USER_1, USER_BLOCKED],
  blocked_users: [USER_BLOCKED],
  ethical_wall_active: true,
};

const permConfidential: MatterPermissionSummary = {
  visibility: "confidential",
  privileged: true,
  legal_hold: false,
  allowed_users: [USER_1],
  blocked_users: [],
  ethical_wall_active: false,
};

function makeResult(
  brainId: string,
  orgId: string,
  overrides: Partial<ScopedResult> = {},
): ScopedResult {
  return { brain_id: brainId, org_id: orgId, ...overrides };
}

// ── Org-Level ─────────────────────────────────────────────────────────

describe("Org-Level Isolation", () => {
  test("assertOrg passes for same org", () => {
    expect(() => guardA.assertOrg(ORG_A)).not.toThrow();
  });

  test("assertOrg throws for different org", () => {
    expect(() => guardA.assertOrg(ORG_B)).toThrow(TenantViolationError);
    try {
      guardA.assertOrg(ORG_B);
    } catch (e) {
      expect(e).toBeInstanceOf(TenantViolationError);
      expect((e as TenantViolationError).violations[0].level).toBe("org");
    }
  });

  test("isOrgAllowed returns true for same org", () => {
    expect(guardA.isOrgAllowed(ORG_A)).toBe(true);
  });

  test("isOrgAllowed returns false for different org", () => {
    expect(guardA.isOrgAllowed(ORG_B)).toBe(false);
  });
});

// ── Brain-Level ───────────────────────────────────────────────────────

describe("Brain-Level Isolation", () => {
  test("assertBrain passes for same brain", () => {
    expect(() => guardA.assertBrain(BRAIN_A)).not.toThrow();
  });

  test("assertBrain throws for different brain without cross-brain flag", () => {
    expect(() => guardA.assertBrain(BRAIN_B)).toThrow(TenantViolationError);
  });

  test("assertBrain passes for different brain with allowCrossBrain=true", () => {
    expect(() => guardA.assertBrain(BRAIN_A2, true)).not.toThrow();
  });

  test("isBrainAllowed returns true for same brain", () => {
    expect(guardA.isBrainAllowed(BRAIN_A)).toBe(true);
  });

  test("isBrainAllowed returns false for different brain without cross-brain", () => {
    expect(guardA.isBrainAllowed(BRAIN_B)).toBe(false);
  });

  test("isBrainAllowed returns true for different brain with cross-brain", () => {
    expect(guardA.isBrainAllowed(BRAIN_A2, true)).toBe(true);
  });
});

// ── Source-Level ──────────────────────────────────────────────────────

describe("Source-Level Isolation", () => {
  test("assertSource passes when source is undefined", () => {
    expect(() => guardA.assertSource(undefined)).not.toThrow();
  });

  test("assertSource passes when source is in allowed list", () => {
    expect(() => guardA.assertSource("dms", ["dms", "email"])).not.toThrow();
  });

  test("assertSource throws when source is not in allowed list", () => {
    expect(() => guardA.assertSource("whatsapp", ["dms", "email"])).toThrow(TenantViolationError);
  });
});

// ── Matter-Level ──────────────────────────────────────────────────────

describe("Matter-Level Isolation", () => {
  test("assertMatter passes with full visibility", () => {
    expect(() => guardA.assertMatter("cases/1", permFull)).not.toThrow();
  });

  test("assertMatter passes when user is in allowed_users", () => {
    expect(() => guardA.assertMatter("cases/1", permRestricted)).not.toThrow();
  });

  test("assertMatter throws when user is not in allowed_users", () => {
    const guardOther = createTenantGuard({ brainId: BRAIN_A, orgId: ORG_A, userId: USER_2 });
    expect(() => guardOther.assertMatter("cases/1", permRestricted)).toThrow(TenantViolationError);
    try {
      guardOther.assertMatter("cases/1", permRestricted);
    } catch (e) {
      expect((e as TenantViolationError).violations[0].level).toBe("user");
    }
  });

  test("assertMatter throws when user is blocked by ethical wall", () => {
    const guardBlocked = createTenantGuard({ brainId: BRAIN_A, orgId: ORG_A, userId: USER_BLOCKED });
    expect(() => guardBlocked.assertMatter("cases/1", permEthicalWall)).toThrow(TenantViolationError);
    try {
      guardBlocked.assertMatter("cases/1", permEthicalWall);
    } catch (e) {
      const violations = (e as TenantViolationError).violations;
      expect(violations.some((v) => v.level === "ethical_wall")).toBe(true);
    }
  });

  test("assertMatter passes for confidential matter with allowed user", () => {
    expect(() => guardA.assertMatter("cases/1", permConfidential)).not.toThrow();
  });

  test("assertMatter passes without permissions (no restriction)", () => {
    expect(() => guardA.assertMatter("cases/1")).not.toThrow();
  });

  test("isMatterAccessible returns true for accessible matter", () => {
    expect(guardA.isMatterAccessible("cases/1", permFull)).toBe(true);
  });

  test("isMatterAccessible returns false for blocked matter", () => {
    const guardBlocked = createTenantGuard({ brainId: BRAIN_A, orgId: ORG_A, userId: USER_BLOCKED });
    expect(guardBlocked.isMatterAccessible("cases/1", permEthicalWall)).toBe(false);
  });

  test("ethical wall blocks even if user is in allowed_users", () => {
    const guardBlocked = createTenantGuard({ brainId: BRAIN_A, orgId: ORG_A, userId: USER_BLOCKED });
    expect(permEthicalWall.allowed_users).toContain(USER_BLOCKED);
    expect(permEthicalWall.blocked_users).toContain(USER_BLOCKED);
    expect(guardBlocked.isMatterAccessible("cases/1", permEthicalWall)).toBe(false);
  });
});

// ── Combined Scope Check ──────────────────────────────────────────────

describe("assertScope (Combined)", () => {
  test("passes for same org + same brain", () => {
    expect(() => guardA.assertScope({ brain_id: BRAIN_A, org_id: ORG_A })).not.toThrow();
  });

  test("throws for different org", () => {
    expect(() => guardA.assertScope({ brain_id: BRAIN_A, org_id: ORG_B })).toThrow(TenantViolationError);
  });

  test("throws for different brain without cross-brain flag", () => {
    expect(() => guardA.assertScope({ brain_id: BRAIN_B, org_id: ORG_A })).toThrow(TenantViolationError);
  });

  test("passes for different brain with allowCrossBrain within same org", () => {
    expect(() => guardA.assertScope({ brain_id: BRAIN_A2, org_id: ORG_A }, { allowCrossBrain: true })).not.toThrow();
  });

  test("throws for cross-brain across different orgs even with flag", () => {
    expect(() => guardA.assertScope({ brain_id: BRAIN_B, org_id: ORG_B }, { allowCrossBrain: true })).toThrow(TenantViolationError);
  });

  test("throws for invalid scope (empty brain_id)", () => {
    expect(() => guardA.assertScope({ brain_id: "", org_id: ORG_A })).toThrow(TenantViolationError);
  });

  test("throws for invalid scope (empty org_id)", () => {
    expect(() => guardA.assertScope({ brain_id: BRAIN_A, org_id: "" })).toThrow(TenantViolationError);
  });

  test("source check included in assertScope", () => {
    expect(() =>
      guardA.assertScope(
        { brain_id: BRAIN_A, org_id: ORG_A, source: "whatsapp" },
        { allowedSources: ["dms", "email"] },
      ),
    ).toThrow(TenantViolationError);
  });

  test("source check passes for allowed source", () => {
    expect(() =>
      guardA.assertScope(
        { brain_id: BRAIN_A, org_id: ORG_A, source: "dms" },
        { allowedSources: ["dms", "email"] },
      ),
    ).not.toThrow();
  });

  test("multiple violations are reported together", () => {
    try {
      guardA.assertScope({ brain_id: BRAIN_B, org_id: ORG_B });
    } catch (e) {
      const violations = (e as TenantViolationError).violations;
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations.some((v) => v.level === "org")).toBe(true);
    }
  });
});

// ── Result Filtering ──────────────────────────────────────────────────

describe("filterResultsByBrain", () => {
  const results: ScopedResult[] = [
    makeResult(BRAIN_A, ORG_A),
    makeResult(BRAIN_B, ORG_B),
    makeResult(BRAIN_A, ORG_A),
    makeResult(BRAIN_A2, ORG_A),
  ];

  test("filters to only same-brain results", () => {
    const filtered = guardA.filterResultsByBrain(results);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.brain_id === BRAIN_A)).toBe(true);
  });

  test("includes cross-brain results with flag", () => {
    const filtered = guardA.filterResultsByBrain(results, true);
    expect(filtered).toHaveLength(3); // BRAIN_A + BRAIN_A + BRAIN_A2
  });

  test("results without brain_id are included", () => {
    const results: ScopedResult[] = [{ org_id: ORG_A }, { brain_id: BRAIN_A, org_id: ORG_A }];
    const filtered = guardA.filterResultsByBrain(results);
    expect(filtered).toHaveLength(2);
  });
});

describe("filterResultsByOrg", () => {
  const results: ScopedResult[] = [
    makeResult(BRAIN_A, ORG_A),
    makeResult(BRAIN_B, ORG_B),
    makeResult(BRAIN_A, ORG_A),
  ];

  test("filters to only same-org results", () => {
    const filtered = guardA.filterResultsByOrg(results);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.org_id === ORG_A)).toBe(true);
  });

  test("results without org_id are included", () => {
    const results: ScopedResult[] = [{ brain_id: BRAIN_A }, { brain_id: BRAIN_A, org_id: ORG_A }];
    const filtered = guardA.filterResultsByOrg(results);
    expect(filtered).toHaveLength(2);
  });
});

describe("filterResultsByMatter", () => {
  const results: ScopedResult[] = [
    makeResult(BRAIN_A, ORG_A, { case_slug: "cases/alpha" }),
    makeResult(BRAIN_A, ORG_A, { case_slug: "cases/beta" }),
    makeResult(BRAIN_A, ORG_A, { case_slug: "cases/alpha/doc-1" }),
    makeResult(BRAIN_A, ORG_A, { case_slug: "cases/gamma" }),
  ];

  test("filters to only accessible cases (prefix match)", () => {
    const accessible = new Set(["cases/alpha"]);
    const filtered = guardA.filterResultsByMatter(results, accessible);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.case_slug?.startsWith("cases/alpha"))).toBe(true);
  });

  test("multiple accessible cases", () => {
    const accessible = new Set(["cases/alpha", "cases/beta"]);
    const filtered = guardA.filterResultsByMatter(results, accessible);
    expect(filtered).toHaveLength(3);
  });

  test("results without case_slug are included", () => {
    const results: ScopedResult[] = [
      makeResult(BRAIN_A, ORG_A),
      makeResult(BRAIN_A, ORG_A, { case_slug: "cases/alpha" }),
    ];
    const accessible = new Set(["cases/alpha"]);
    const filtered = guardA.filterResultsByMatter(results, accessible);
    expect(filtered).toHaveLength(2);
  });

  test("empty accessible set filters out all cased results", () => {
    const accessible = new Set<string>();
    const filtered = guardA.filterResultsByMatter(results, accessible);
    expect(filtered).toHaveLength(0);
  });
});

describe("filterResults (Combined)", () => {
  const results: ScopedResult[] = [
    makeResult(BRAIN_A, ORG_A, { case_slug: "cases/alpha", source: "dms" }),
    makeResult(BRAIN_B, ORG_B, { case_slug: "cases/beta", source: "email" }),
    makeResult(BRAIN_A, ORG_A, { case_slug: "cases/beta", source: "whatsapp" }),
    makeResult(BRAIN_A2, ORG_A, { case_slug: "cases/alpha", source: "dms" }),
  ];

  test("filters by org + brain + matter + source", () => {
    const filtered = guardA.filterResults(results, {
      accessibleCases: new Set(["cases/alpha"]),
      allowedSources: ["dms"],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].case_slug).toBe("cases/alpha");
    expect(filtered[0].source).toBe("dms");
  });

  test("cross-brain includes same-org different-brain results", () => {
    const filtered = guardA.filterResults(results, {
      allowCrossBrain: true,
      accessibleCases: new Set(["cases/alpha"]),
      allowedSources: ["dms"],
    });
    expect(filtered).toHaveLength(2); // brain-alpha + brain-alpha-2
  });

  test("no options = org + brain filter only", () => {
    const filtered = guardA.filterResults(results);
    expect(filtered).toHaveLength(2); // brain-alpha results only
  });
});

// ── Export Guard ──────────────────────────────────────────────────────

describe("assertExportScope", () => {
  test("passes for same brain + org", () => {
    expect(() => guardA.assertExportScope({ brain_id: BRAIN_A, org_id: ORG_A })).not.toThrow();
  });

  test("throws for cross-brain (export never allows cross-brain)", () => {
    expect(() => guardA.assertExportScope({ brain_id: BRAIN_A2, org_id: ORG_A })).toThrow(TenantViolationError);
  });

  test("throws for cross-org", () => {
    expect(() => guardA.assertExportScope({ brain_id: BRAIN_B, org_id: ORG_B })).toThrow(TenantViolationError);
  });
});

// ── Analytics Guard ───────────────────────────────────────────────────

describe("assertAnalyticsScope", () => {
  test("passes for same org", () => {
    expect(() => guardA.assertAnalyticsScope(ORG_A)).not.toThrow();
  });

  test("throws for different org", () => {
    expect(() => guardA.assertAnalyticsScope(ORG_B)).toThrow(TenantViolationError);
  });
});

// ── Portal Guard ──────────────────────────────────────────────────────

describe("assertPortalScope", () => {
  test("passes for matching brain", () => {
    expect(() => guardA.assertPortalScope("cases/1", BRAIN_A)).not.toThrow();
  });

  test("throws for different brain", () => {
    expect(() => guardA.assertPortalScope("cases/1", BRAIN_B)).toThrow(TenantViolationError);
  });
});

// ── Guard Identity ────────────────────────────────────────────────────

describe("Guard Identity", () => {
  test("guard exposes context", () => {
    expect(guardA.ctx.brainId).toBe(BRAIN_A);
    expect(guardA.ctx.orgId).toBe(ORG_A);
    expect(guardA.ctx.userId).toBe(USER_1);
  });

  test("guard exposes userScope", () => {
    expect(guardA.userScope.brain_id).toBe(BRAIN_A);
    expect(guardA.userScope.org_id).toBe(ORG_A);
  });

  test("different guards have different scopes", () => {
    expect(guardA.userScope.brain_id).not.toBe(guardB.userScope.brain_id);
    expect(guardA.userScope.org_id).not.toBe(guardB.userScope.org_id);
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  test("empty results array → empty filtered", () => {
    expect(guardA.filterResults([])).toHaveLength(0);
    expect(guardA.filterResultsByBrain([])).toHaveLength(0);
    expect(guardA.filterResultsByOrg([])).toHaveLength(0);
    expect(guardA.filterResultsByMatter([], new Set())).toHaveLength(0);
  });

  test("results with all undefined scope fields are included", () => {
    const results: ScopedResult[] = [{}];
    expect(guardA.filterResults(results)).toHaveLength(1);
  });

  test("legal hold does not block retrieval", () => {
    const permLegalHold: MatterPermissionSummary = {
      visibility: "full",
      privileged: false,
      legal_hold: true,
      allowed_users: [],
      blocked_users: [],
      ethical_wall_active: false,
    };
    expect(() => guardA.assertMatter("cases/1", permLegalHold)).not.toThrow();
  });

  test("confidential + privileged matter only for allowed user", () => {
    const guardOther = createTenantGuard({ brainId: BRAIN_A, orgId: ORG_A, userId: USER_2 });
    expect(() => guardA.assertMatter("cases/1", permConfidential)).not.toThrow();
    expect(() => guardOther.assertMatter("cases/1", permConfidential)).toThrow(TenantViolationError);
  });

  test("TenantViolationError has correct shape", () => {
    try {
      guardA.assertOrg(ORG_B);
    } catch (e) {
      const err = e as TenantViolationError;
      expect(err.name).toBe("TenantViolationError");
      expect(err.violations).toBeInstanceOf(Array);
      expect(err.violations.length).toBeGreaterThan(0);
      expect(err.violations[0].level).toBeDefined();
      expect(err.violations[0].message).toBeDefined();
    }
  });
});

// ── Source Leakage Rate = 0 ───────────────────────────────────────────

describe("Source Leakage Prevention", () => {
  test("no cross-org results leak through filterResults", () => {
    const results: ScopedResult[] = [
      makeResult(BRAIN_A, ORG_A, { case_slug: "cases/1" }),
      makeResult(BRAIN_B, ORG_B, { case_slug: "cases/2" }),
      makeResult(BRAIN_A, ORG_A, { case_slug: "cases/3" }),
      makeResult(BRAIN_B, ORG_B, { case_slug: "cases/4" }),
    ];
    const filtered = guardA.filterResults(results);
    expect(filtered.every((r) => r.org_id === ORG_A)).toBe(true);
    expect(filtered.every((r) => r.brain_id === BRAIN_A)).toBe(true);
  });

  test("no cross-brain results leak without cross-brain flag", () => {
    const results: ScopedResult[] = [
      makeResult(BRAIN_A, ORG_A),
      makeResult(BRAIN_A2, ORG_A),
      makeResult(BRAIN_B, ORG_B),
    ];
    const filtered = guardA.filterResults(results);
    expect(filtered.every((r) => r.brain_id === BRAIN_A)).toBe(true);
    expect(filtered).toHaveLength(1);
  });

  test("ethical wall blocks all results for blocked user", () => {
    const guardBlocked = createTenantGuard({ brainId: BRAIN_A, orgId: ORG_A, userId: USER_BLOCKED });
    expect(guardBlocked.isMatterAccessible("cases/1", permEthicalWall)).toBe(false);
    expect(guardBlocked.isMatterAccessible("cases/2", permEthicalWall)).toBe(false);
  });

  test("matter filter prevents cross-matter leakage", () => {
    const results: ScopedResult[] = [
      makeResult(BRAIN_A, ORG_A, { case_slug: "cases/alpha/doc-1" }),
      makeResult(BRAIN_A, ORG_A, { case_slug: "cases/beta/doc-2" }),
      makeResult(BRAIN_A, ORG_A, { case_slug: "cases/alpha/doc-3" }),
    ];
    const accessible = new Set(["cases/alpha"]);
    const filtered = guardA.filterResultsByMatter(results, accessible);
    expect(filtered.every((r) => r.case_slug?.startsWith("cases/alpha"))).toBe(true);
    expect(filtered).toHaveLength(2);
  });
});
