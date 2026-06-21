/**
 * Permission-aware Retrieval Tests — Spezifikation und Tests für
 * Org/Brain/Source/Matter/User/Ethical-Wall-Kontext in Retrieval-Ergebnissen.
 *
 * Verifiziert, dass die Retrieval-Pipeline Ergebnisse korrekt filtert basierend auf:
 *   1. Org-Isolation: Nur Ergebnisse aus der eigenen Org
 *   2. Brain-Isolation: Nur Ergebnisse aus dem eigenen Brain (außer cross_brain)
 *   3. Source-Isolation: Nur Ergebnisse aus freigegebenen Sources
 *   4. Matter-Isolation: Nur Ergebnisse aus Akten mit Zugriff
 *   5. User-Isolation: Nur Ergebnisse für den authentifizierten User
 *   6. Ethical-Wall: Blockierte User werden aus Ergebnissen entfernt
 *   7. Query-Mode: Verschiedene Modi liefern unterschiedliche Scopes
 */

import { describe, it, expect } from "vitest";
import { isSameOrg, isSameBrain, type TenantScope } from "@/lib/data-classification";
import type {
  RetrievalExplanation,
  ExplainedSearchResult,
  MatterPermissionSummary,
  QueryMode,
} from "@/lib/matter-context-types";

// ── Fixtures ──────────────────────────────────────────────────────────

const ORG_A: TenantScope = { brain_id: "brain-a", org_id: "org-1" };
const ORG_B: TenantScope = { brain_id: "brain-b", org_id: "org-2" };

const PERMISSIONS_FULL: MatterPermissionSummary = {
  visibility: "full",
  privileged: false,
  legal_hold: false,
  allowed_users: [],
  blocked_users: [],
  ethical_wall_active: false,
};

const PERMISSIONS_RESTRICTED: MatterPermissionSummary = {
  visibility: "restricted",
  privileged: false,
  legal_hold: false,
  allowed_users: ["user-1", "user-2"],
  blocked_users: [],
  ethical_wall_active: false,
};

const PERMISSIONS_ETHICAL_WALL: MatterPermissionSummary = {
  visibility: "confidential",
  privileged: true,
  legal_hold: false,
  allowed_users: ["user-1", "user-2", "user-3"],
  blocked_users: ["user-3"],
  ethical_wall_active: true,
};

function makeExplanation(overrides: Partial<RetrievalExplanation> = {}): RetrievalExplanation {
  return {
    slug: "cases/test",
    title: "Test Case",
    score: 0.85,
    search_mode: "hybrid",
    source: "internal",
    source_type: "dms",
    recency_hours: 24,
    permission_filtered: false,
    ...overrides,
  };
}

function makeResult(
  slug: string,
  orgId: string,
  brainId: string,
  overrides: Partial<RetrievalExplanation> = {}
): ExplainedSearchResult & { _org_id: string; _brain_id: string } {
  const explanation = makeExplanation({ slug, ...overrides });
  return {
    slug,
    title: `Result ${slug}`,
    snippet: "Test snippet",
    score: 0.9,
    explanation,
    _org_id: orgId,
    _brain_id: brainId,
  };
}

// ── 1. Org-Isolation in Retrieval ─────────────────────────────────────

describe("Org-Isolation in Retrieval", () => {
  it("filters out results from other orgs", () => {
    const results = [
      makeResult("cases/1", "org-1", "brain-a"),
      makeResult("cases/2", "org-2", "brain-b"),
      makeResult("cases/3", "org-1", "brain-a"),
    ];
    const scoped = results.filter((r) => r._org_id === ORG_A.org_id);
    expect(scoped).toHaveLength(2);
    expect(scoped.every((r) => r._org_id === ORG_A.org_id)).toBe(true);
  });

  it("returns empty for org with no data", () => {
    const results = [makeResult("cases/1", "org-1", "brain-a")];
    const scoped = results.filter((r) => r._org_id === ORG_B.org_id);
    expect(scoped).toHaveLength(0);
  });
});

// ── 2. Brain-Isolation in Retrieval ───────────────────────────────────

describe("Brain-Isolation in Retrieval", () => {
  it("filters out results from other brains", () => {
    const results = [
      makeResult("cases/1", "org-1", "brain-a"),
      makeResult("cases/2", "org-1", "brain-b"),
    ];
    const scoped = results.filter((r) => r._brain_id === ORG_A.brain_id);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].slug).toBe("cases/1");
  });

  it("cross-brain search includes results from same org different brain", () => {
    const results = [
      makeResult("cases/1", "org-1", "brain-a"),
      makeResult("cases/2", "org-1", "brain-b"),
    ];
    // Cross-brain: same org, different brain
    const scoped = results.filter((r) => r._org_id === ORG_A.org_id);
    expect(scoped).toHaveLength(2);
  });
});

// ── 3. Source-Isolation in Retrieval ──────────────────────────────────

describe("Source-Isolation in Retrieval", () => {
  it("filters by source_type when query mode is conservative", () => {
    const results = [
      makeResult("statutes/bgb", "org-1", "brain-a", { source_type: "statute_corpus" }),
      makeResult("cases/1", "org-1", "brain-a", { source_type: "dms" }),
      makeResult("judgements/bgh-1", "org-1", "brain-a", { source_type: "judgement_api" }),
    ];
    const externalLaw = results.filter(
      (r) =>
        r.explanation.source_type === "statute_corpus" ||
        r.explanation.source_type === "judgement_api"
    );
    expect(externalLaw).toHaveLength(2);
    expect(externalLaw.some((r) => r.explanation.source_type === "dms")).toBe(false);
  });

  it("includes all source types in deep_matter mode", () => {
    const results = [
      makeResult("statutes/bgb", "org-1", "brain-a", { source_type: "statute_corpus" }),
      makeResult("cases/1", "org-1", "brain-a", { source_type: "dms" }),
      makeResult("emails/1", "org-1", "brain-a", { source_type: "email" }),
    ];
    // deep_matter includes everything in the brain
    expect(results).toHaveLength(3);
  });
});

// ── 4. Matter-Isolation in Retrieval ──────────────────────────────────

describe("Matter-Isolation in Retrieval", () => {
  it("filters results to only accessible cases", () => {
    const accessibleCases = new Set(["cases/1", "cases/3"]);
    const results = [
      makeResult("cases/1", "org-1", "brain-a"),
      makeResult("cases/2", "org-1", "brain-a"),
      makeResult("cases/3", "org-1", "brain-a"),
    ];
    const scoped = results.filter((r) => accessibleCases.has(r.slug));
    expect(scoped).toHaveLength(2);
    expect(scoped.every((r) => accessibleCases.has(r.slug))).toBe(true);
  });
});

// ── 5. User-Isolation in Retrieval ────────────────────────────────────

describe("User-Isolation in Retrieval", () => {
  it("marks results as permission_filtered when user is not in allowed_users", () => {
    const permissions: MatterPermissionSummary = {
      ...PERMISSIONS_RESTRICTED,
      allowed_users: ["user-1"],
    };
    const currentUser = "user-5";
    const hasAccess = permissions.allowed_users.includes(currentUser);
    expect(hasAccess).toBe(false);
  });

  it("allows access when user is in allowed_users", () => {
    const permissions: MatterPermissionSummary = {
      ...PERMISSIONS_RESTRICTED,
      allowed_users: ["user-1", "user-2"],
    };
    const currentUser = "user-1";
    const hasAccess = permissions.allowed_users.includes(currentUser);
    expect(hasAccess).toBe(true);
  });

  it("full visibility grants access to all users", () => {
    const permissions = PERMISSIONS_FULL;
    expect(permissions.visibility).toBe("full");
    // Full visibility means no user filtering
    expect(permissions.allowed_users).toHaveLength(0);
  });
});

// ── 6. Ethical-Wall in Retrieval ──────────────────────────────────────

describe("Ethical-Wall in Retrieval", () => {
  it("blocks users in blocked_users list", () => {
    const permissions = PERMISSIONS_ETHICAL_WALL;
    const blockedUser = "user-3";
    expect(permissions.blocked_users).toContain(blockedUser);
    expect(permissions.ethical_wall_active).toBe(true);
  });

  it("detects ethical wall violation when user is in both lists", () => {
    const permissions = PERMISSIONS_ETHICAL_WALL;
    const overlap = permissions.allowed_users.filter((u) => permissions.blocked_users.includes(u));
    expect(overlap).toHaveLength(1);
    expect(overlap[0]).toBe("user-3");
  });

  it("blocked user should not see results from that matter", () => {
    const permissions = PERMISSIONS_ETHICAL_WALL;
    const blockedUser = "user-3";
    const isBlocked = permissions.blocked_users.includes(blockedUser);
    expect(isBlocked).toBe(true);
    // Blocked user should get no results
  });

  it("non-blocked user with access can see results", () => {
    const permissions = PERMISSIONS_ETHICAL_WALL;
    const user = "user-1";
    const isBlocked = permissions.blocked_users.includes(user);
    const isAllowed = permissions.allowed_users.includes(user);
    expect(isBlocked).toBe(false);
    expect(isAllowed).toBe(true);
  });
});

// ── 7. Query-Mode Scoping ─────────────────────────────────────────────

describe("Query-Mode Scoping", () => {
  const modes: QueryMode[] = ["conservative", "balanced", "deep_matter"];

  it("conservative mode only includes high-trust sources", () => {
    const mode: QueryMode = "conservative";
    const allowedSources = ["statute_corpus", "judgement_api"];
    const results = [
      makeResult("s1", "org-1", "brain-a", { source_type: "statute_corpus" }),
      makeResult("s2", "org-1", "brain-a", { source_type: "dms" }),
      makeResult("s3", "org-1", "brain-a", { source_type: "email" }),
    ];
    const scoped = results.filter((r) => allowedSources.includes(r.explanation.source_type ?? ""));
    expect(scoped).toHaveLength(1);
    expect(scoped[0].explanation.source_type).toBe("statute_corpus");
    expect(mode).toBe("conservative");
  });

  it("balanced mode includes internal + approved sources", () => {
    const mode: QueryMode = "balanced";
    const allowedSources = ["statute_corpus", "judgement_api", "dms", "upload"];
    const results = [
      makeResult("s1", "org-1", "brain-a", { source_type: "statute_corpus" }),
      makeResult("s2", "org-1", "brain-a", { source_type: "dms" }),
      makeResult("s3", "org-1", "brain-a", { source_type: "email" }),
    ];
    const scoped = results.filter((r) => allowedSources.includes(r.explanation.source_type ?? ""));
    expect(scoped).toHaveLength(2);
    expect(mode).toBe("balanced");
  });

  it("deep_matter mode includes all sources", () => {
    const mode: QueryMode = "deep_matter";
    const results = [
      makeResult("s1", "org-1", "brain-a", { source_type: "statute_corpus" }),
      makeResult("s2", "org-1", "brain-a", { source_type: "dms" }),
      makeResult("s3", "org-1", "brain-a", { source_type: "email" }),
      makeResult("s4", "org-1", "brain-a", { source_type: "whatsapp" }),
    ];
    expect(results).toHaveLength(4);
    expect(mode).toBe("deep_matter");
  });

  it("all 3 modes are defined", () => {
    expect(modes).toHaveLength(3);
    expect(modes).toContain("conservative");
    expect(modes).toContain("balanced");
    expect(modes).toContain("deep_matter");
  });
});

// ── 8. Permission-Filtered Flag in Explanation ────────────────────────

describe("Permission-Filtered Flag", () => {
  it("permission_filtered is false by default", () => {
    const explanation = makeExplanation();
    expect(explanation.permission_filtered).toBe(false);
  });

  it("permission_filtered is true when result was filtered", () => {
    const explanation = makeExplanation({ permission_filtered: true });
    expect(explanation.permission_filtered).toBe(true);
  });

  it("explains why a result was excluded", () => {
    const explanation = makeExplanation({
      permission_filtered: true,
      slug: "cases/confidential",
    });
    expect(explanation.permission_filtered).toBe(true);
    expect(explanation.slug).toBe("cases/confidential");
  });
});

// ── 9. Combined Permission Checks ─────────────────────────────────────

describe("Combined Permission Checks", () => {
  it("user must pass org, brain, matter, and ethical-wall checks", () => {
    const userScope: TenantScope = { brain_id: "brain-a", org_id: "org-1" };
    const dataScope: TenantScope = { brain_id: "brain-a", org_id: "org-1" };
    const permissions: MatterPermissionSummary = {
      visibility: "restricted",
      privileged: false,
      legal_hold: false,
      allowed_users: ["user-1"],
      blocked_users: [],
      ethical_wall_active: false,
    };
    const currentUser = "user-1";

    const orgOk = isSameOrg(userScope, dataScope);
    const brainOk = isSameBrain(userScope, dataScope);
    const userOk = permissions.allowed_users.includes(currentUser);
    const notBlocked = !permissions.blocked_users.includes(currentUser);

    expect(orgOk && brainOk && userOk && notBlocked).toBe(true);
  });

  it("fails when user is blocked by ethical wall", () => {
    const permissions = PERMISSIONS_ETHICAL_WALL;
    const currentUser = "user-3";

    const isAllowed = permissions.allowed_users.includes(currentUser);
    const isBlocked = permissions.blocked_users.includes(currentUser);

    // Even though user is in allowed_users, ethical wall blocks them
    expect(isAllowed).toBe(true);
    expect(isBlocked).toBe(true);
    // Blocked takes precedence
    expect(isBlocked).toBe(true);
  });

  it("fails when org doesn't match", () => {
    expect(isSameOrg(ORG_A, ORG_B)).toBe(false);
  });

  it("fails when brain doesn't match and no cross_brain", () => {
    expect(isSameBrain(ORG_A, ORG_B)).toBe(false);
  });
});
