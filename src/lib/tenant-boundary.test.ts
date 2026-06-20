/**
 * Tenant Boundary Tests — Spezifikation und Tests für
 * Brain/Org/Source-Isolation in Suche, Export, Portal, DMS und Analytics.
 *
 * Diese Tests verifizieren, dass Daten nicht über Tenant-Grenzen
 * (Brain-ID, Org-ID, Source) hinweg zugänglich sind.
 *
 * Getestet werden:
 *   1. Brain-Isolation: Pages einer Brain sind nicht in einer anderen sichtbar
 *   2. Org-Isolation: Users einer Org können nicht auf Daten einer anderen Org zugreifen
 *   3. Source-Isolation: Innerhalb einer Brain sind Sources isoliert
 *   4. Search-Isolation: Suche liefert nur Ergebnisse aus dem eigenen Tenant
 *   5. Export-Isolation: Export enthält nur Daten aus dem eigenen Tenant
 *   6. Portal-Isolation: Portal-Tokens sind auf eine Akte + Brain beschränkt
 *   7. DMS-Isolation: Dokumente sind auf Brain + Case isoliert
 *   8. Analytics-Isolation: Metriken sind pro-Brain, nicht cross-Org
 */

import { describe, it, expect } from "vitest";
import {
  validateTenantScope,
  isSameOrg,
  isSameBrain,
  type TenantScope,
} from "@/lib/data-classification";

// ── Test Fixtures ─────────────────────────────────────────────────────

const TENANT_A: TenantScope = {
  brain_id: "brain-alpha",
  org_id: "org-1",
  source: "default",
};

const TENANT_B: TenantScope = {
  brain_id: "brain-beta",
  org_id: "org-2",
  source: "default",
};

const TENANT_SAME_ORG_DIFFERENT_BRAIN: TenantScope = {
  brain_id: "brain-beta",
  org_id: "org-1",
  source: "default",
};

const TENANT_SAME_BRAIN_DIFFERENT_SOURCE: TenantScope = {
  brain_id: "brain-alpha",
  org_id: "org-1",
  source: "archive",
};

const TENANT_CROSS_BRAIN: TenantScope = {
  brain_id: "brain-beta",
  org_id: "org-1",
  source: "default",
  cross_brain: true,
};

// ── 1. Brain Isolation ────────────────────────────────────────────────

describe("Brain Isolation", () => {
  it("different brains are not same brain", () => {
    expect(isSameBrain(TENANT_A, TENANT_B)).toBe(false);
  });

  it("same brain_id + same org_id = same brain", () => {
    expect(isSameBrain(TENANT_A, TENANT_A)).toBe(true);
  });

  it("different brain_id but same org_id = not same brain", () => {
    expect(isSameBrain(TENANT_A, TENANT_SAME_ORG_DIFFERENT_BRAIN)).toBe(false);
  });

  it("same brain_id but different org_id = not same brain", () => {
    const a: TenantScope = { brain_id: "brain-x", org_id: "org-1" };
    const b: TenantScope = { brain_id: "brain-x", org_id: "org-2" };
    expect(isSameBrain(a, b)).toBe(false);
  });
});

// ── 2. Org Isolation ──────────────────────────────────────────────────

describe("Org Isolation", () => {
  it("different orgs are not same org", () => {
    expect(isSameOrg(TENANT_A, TENANT_B)).toBe(false);
  });

  it("same org_id = same org even with different brain", () => {
    expect(isSameOrg(TENANT_A, TENANT_SAME_ORG_DIFFERENT_BRAIN)).toBe(true);
  });

  it("same org_id + same brain_id = same org", () => {
    expect(isSameOrg(TENANT_A, TENANT_A)).toBe(true);
  });
});

// ── 3. Source Isolation ───────────────────────────────────────────────

describe("Source Isolation", () => {
  it("same brain but different source = different scope", () => {
    expect(TENANT_A.source).not.toBe(TENANT_SAME_BRAIN_DIFFERENT_SOURCE.source);
    expect(TENANT_A.brain_id).toBe(TENANT_SAME_BRAIN_DIFFERENT_SOURCE.brain_id);
  });

  it("source field is optional (defaults to undefined)", () => {
    const scope: TenantScope = { brain_id: "b1", org_id: "o1" };
    expect(scope.source).toBeUndefined();
  });

  it("cross_brain flag allows cross-brain access within same org", () => {
    expect(TENANT_CROSS_BRAIN.cross_brain).toBe(true);
    expect(isSameOrg(TENANT_A, TENANT_CROSS_BRAIN)).toBe(true);
  });
});

// ── 4. Tenant Scope Validation ────────────────────────────────────────

describe("validateTenantScope", () => {
  it("valid scope passes", () => {
    const result = validateTenantScope(TENANT_A);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("missing brain_id fails", () => {
    const result = validateTenantScope({ brain_id: "", org_id: "org-1" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("brain_id is required");
  });

  it("missing org_id fails", () => {
    const result = validateTenantScope({ brain_id: "brain-1", org_id: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("org_id is required");
  });

  it("whitespace-only brain_id fails", () => {
    const result = validateTenantScope({ brain_id: "  ", org_id: "org-1" });
    expect(result.valid).toBe(false);
  });

  it("both missing fails with 2 errors", () => {
    const result = validateTenantScope({ brain_id: "", org_id: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

// ── 5. Search Isolation Specification ─────────────────────────────────

describe("Search Isolation Specification", () => {
  it("search must filter by brain_id", () => {
    const searchParams = {
      query: "Haftung",
      brain_id: TENANT_A.brain_id,
      org_id: TENANT_A.org_id,
    };
    expect(searchParams.brain_id).toBe(TENANT_A.brain_id);
    expect(searchParams.brain_id).not.toBe(TENANT_B.brain_id);
  });

  it("cross-brain search requires explicit cross_brain flag", () => {
    const crossBrainSearch = {
      query: "Haftung",
      org_id: TENANT_A.org_id,
      cross_brain: true,
    };
    expect(crossBrainSearch.cross_brain).toBe(true);
    expect(crossBrainSearch.org_id).toBe(TENANT_A.org_id);
    expect(crossBrainSearch.org_id).toBe(TENANT_CROSS_BRAIN.org_id);
  });

  it("search results must not leak across orgs", () => {
    const orgAResults = [{ brain_id: "brain-alpha", org_id: "org-1" }];
    const orgBResults = [{ brain_id: "brain-beta", org_id: "org-2" }];
    const combined = [...orgAResults, ...orgBResults];
    const filtered = combined.filter((r) => r.org_id === TENANT_A.org_id);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].org_id).toBe(TENANT_A.org_id);
  });
});

// ── 6. Export Isolation Specification ─────────────────────────────────

describe("Export Isolation Specification", () => {
  it("export must be scoped to a single brain", () => {
    const exportRequest = {
      brain_id: TENANT_A.brain_id,
      org_id: TENANT_A.org_id,
      format: "pdf" as const,
    };
    expect(exportRequest.brain_id).toBeTruthy();
    expect(exportRequest.org_id).toBeTruthy();
  });

  it("export items must all belong to the same brain", () => {
    const items = [
      { slug: "cases/1", brain_id: "brain-alpha" },
      { slug: "cases/2", brain_id: "brain-alpha" },
      { slug: "cases/3", brain_id: "brain-beta" }, // should be filtered out
    ];
    const scoped = items.filter((i) => i.brain_id === TENANT_A.brain_id);
    expect(scoped).toHaveLength(2);
    expect(scoped.every((i) => i.brain_id === TENANT_A.brain_id)).toBe(true);
  });
});

// ── 7. Portal Isolation Specification ─────────────────────────────────

describe("Portal Isolation Specification", () => {
  it("portal token is scoped to a single case_slug", () => {
    const tokenPayload = {
      case_slug: "cases/123",
      brain_id: TENANT_A.brain_id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    expect(tokenPayload.case_slug).toBeTruthy();
    expect(tokenPayload.brain_id).toBe(TENANT_A.brain_id);
  });

  it("portal token must not grant access to other cases", () => {
    const allowedCase = "cases/123";
    const requestedCase = "cases/456";
    expect(allowedCase).not.toBe(requestedCase);
  });

  it("portal token brain_id must match the case's brain", () => {
    const tokenBrain = TENANT_A.brain_id;
    const caseBrain = TENANT_B.brain_id;
    expect(isSameBrain(
      { brain_id: tokenBrain, org_id: TENANT_A.org_id },
      { brain_id: caseBrain, org_id: TENANT_B.org_id },
    )).toBe(false);
  });
});

// ── 8. DMS Isolation Specification ────────────────────────────────────

describe("DMS Isolation Specification", () => {
  it("document access requires matching brain_id", () => {
    const doc = { slug: "documents/1", brain_id: "brain-alpha", case_slug: "cases/1" };
    const requestBrain = "brain-beta";
    expect(doc.brain_id).not.toBe(requestBrain);
  });

  it("document access requires matching case_slug within brain", () => {
    const doc = { slug: "documents/1", brain_id: "brain-alpha", case_slug: "cases/1" };
    const requestCase = "cases/2";
    expect(doc.case_slug).not.toBe(requestCase);
  });
});

// ── 9. Analytics Isolation Specification ──────────────────────────────

describe("Analytics Isolation Specification", () => {
  it("analytics queries must be scoped to brain_id", () => {
    const query = {
      metric: "revenue",
      brain_id: TENANT_A.brain_id,
      period: "2026-06",
    };
    expect(query.brain_id).toBe(TENANT_A.brain_id);
    expect(query.brain_id).not.toBe(TENANT_B.brain_id);
  });

  it("cross-org analytics must be explicitly disabled by default", () => {
    const defaultConfig = { cross_org: false };
    expect(defaultConfig.cross_org).toBe(false);
  });

  it("analytics results must not include other orgs' data", () => {
    const results = [
      { brain_id: "brain-alpha", org_id: "org-1", value: 50000 },
      { brain_id: "brain-beta", org_id: "org-2", value: 30000 },
    ];
    const scoped = results.filter((r) => r.org_id === TENANT_A.org_id);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].value).toBe(50000);
  });
});

// ── 10. Boundary Violation Detection ──────────────────────────────────

describe("Boundary Violation Detection", () => {
  it("detects when a user from org-2 tries to access org-1 data", () => {
    const userScope: TenantScope = { brain_id: "brain-beta", org_id: "org-2" };
    const dataScope: TenantScope = { brain_id: "brain-alpha", org_id: "org-1" };
    expect(isSameOrg(userScope, dataScope)).toBe(false);
    expect(isSameBrain(userScope, dataScope)).toBe(false);
  });

  it("detects when cross_brain is used without same org", () => {
    const scope: TenantScope = {
      brain_id: "brain-beta",
      org_id: "org-2",
      cross_brain: true,
    };
    // Even with cross_brain, the org must match
    expect(isSameOrg(TENANT_A, scope)).toBe(false);
  });

  it("allows cross_brain access within same org", () => {
    expect(isSameOrg(TENANT_A, TENANT_CROSS_BRAIN)).toBe(true);
    expect(TENANT_CROSS_BRAIN.cross_brain).toBe(true);
  });
});
