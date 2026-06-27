/**
 * Tests für Privilege & Confidentiality Labels — P0-ETHICS-001.
 */

import { describe, it, expect } from "vitest";
import {
  PRIVILEGE_LABELS,
  CONFIDENTIALITY_LABELS,
  propagateMatterToDocument,
  propagateToAiPrompt,
  propagateToExport,
  maxPrivilege,
  maxConfidentiality,
  privilegeRank,
  confidentialityRank,
  inferConfidentialityFromPermissions,
  inferPrivilegeFromPermissions,
  shouldRedactForExport,
  validatePrivilegeLabel,
  canShareWith,
  type PrivilegeLevel,
  type ConfidentialityLevel,
  type MatterPrivilegeLabel,
  type PrivilegeLabel,
} from "@/lib/privilege-labels";
import type { PermissionInfo } from "@/lib/legal-types";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeMatterLabel(overrides: Partial<MatterPrivilegeLabel> = {}): MatterPrivilegeLabel {
  return {
    case_slug: "cases/test-1",
    privilege: "attorney_client",
    confidentiality: "confidential",
    labeled_at: "2026-06-20T12:00:00Z",
    labeled_by: "user-lawyer-1",
    ...overrides,
  };
}

function makePermissionInfo(overrides: Partial<PermissionInfo> = {}): PermissionInfo {
  return {
    visibility: "full",
    ...overrides,
  };
}

// ── Label Maps ────────────────────────────────────────────────────────

describe("PRIVILEGE_LABELS", () => {
  it("has all 4 privilege levels", () => {
    expect(Object.keys(PRIVILEGE_LABELS)).toHaveLength(4);
  });

  it("has label and description for each level", () => {
    for (const key of Object.keys(PRIVILEGE_LABELS) as PrivilegeLevel[]) {
      expect(PRIVILEGE_LABELS[key].label).toBeTruthy();
      expect(PRIVILEGE_LABELS[key].description).toBeTruthy();
    }
  });
});

describe("CONFIDENTIALITY_LABELS", () => {
  it("has all 4 confidentiality levels", () => {
    expect(Object.keys(CONFIDENTIALITY_LABELS)).toHaveLength(4);
  });

  it("has label and description for each level", () => {
    for (const key of Object.keys(CONFIDENTIALITY_LABELS) as ConfidentialityLevel[]) {
      expect(CONFIDENTIALITY_LABELS[key].label).toBeTruthy();
      expect(CONFIDENTIALITY_LABELS[key].description).toBeTruthy();
    }
  });
});

// ── maxPrivilege / maxConfidentiality ─────────────────────────────────

describe("maxPrivilege", () => {
  it("attorney_client > work_product", () => {
    expect(maxPrivilege("attorney_client", "work_product")).toBe("attorney_client");
  });

  it("work_product > joint_defense", () => {
    expect(maxPrivilege("work_product", "joint_defense")).toBe("work_product");
  });

  it("joint_defense > none", () => {
    expect(maxPrivilege("joint_defense", "none")).toBe("joint_defense");
  });

  it("none is lowest", () => {
    expect(maxPrivilege("none", "attorney_client")).toBe("attorney_client");
  });

  it("same level returns same", () => {
    expect(maxPrivilege("work_product", "work_product")).toBe("work_product");
  });
});

describe("maxConfidentiality", () => {
  it("restricted > confidential", () => {
    expect(maxConfidentiality("restricted", "confidential")).toBe("restricted");
  });

  it("confidential > internal", () => {
    expect(maxConfidentiality("confidential", "internal")).toBe("confidential");
  });

  it("internal > public", () => {
    expect(maxConfidentiality("internal", "public")).toBe("internal");
  });

  it("same level returns same", () => {
    expect(maxConfidentiality("public", "public")).toBe("public");
  });
});

// ── privilegeRank / confidentialityRank ───────────────────────────────

describe("privilegeRank", () => {
  it("returns correct ranks", () => {
    expect(privilegeRank("none")).toBe(0);
    expect(privilegeRank("joint_defense")).toBe(1);
    expect(privilegeRank("work_product")).toBe(2);
    expect(privilegeRank("attorney_client")).toBe(3);
  });
});

describe("confidentialityRank", () => {
  it("returns correct ranks", () => {
    expect(confidentialityRank("public")).toBe(0);
    expect(confidentialityRank("internal")).toBe(1);
    expect(confidentialityRank("confidential")).toBe(2);
    expect(confidentialityRank("restricted")).toBe(3);
  });
});

// ── propagateMatterToDocument ─────────────────────────────────────────

describe("propagateMatterToDocument", () => {
  it("inherits matter labels by default", () => {
    const matter = makeMatterLabel();
    const doc = propagateMatterToDocument(matter);
    expect(doc.privilege).toBe("attorney_client");
    expect(doc.confidentiality).toBe("confidential");
    expect(doc.case_slug).toBe("cases/test-1");
    expect(doc.reason).toContain("Inherited");
  });

  it("can upgrade privilege but not downgrade", () => {
    const matter = makeMatterLabel({ privilege: "work_product" });
    const doc = propagateMatterToDocument(matter, { privilege: "attorney_client" });
    expect(doc.privilege).toBe("attorney_client");
  });

  it("cannot downgrade privilege below matter level", () => {
    const matter = makeMatterLabel({ privilege: "attorney_client" });
    const doc = propagateMatterToDocument(matter, { privilege: "none" });
    expect(doc.privilege).toBe("attorney_client");
  });

  it("can upgrade confidentiality but not downgrade", () => {
    const matter = makeMatterLabel({ confidentiality: "internal" });
    const doc = propagateMatterToDocument(matter, { confidentiality: "restricted" });
    expect(doc.confidentiality).toBe("restricted");
  });

  it("cannot downgrade confidentiality below matter level", () => {
    const matter = makeMatterLabel({ confidentiality: "confidential" });
    const doc = propagateMatterToDocument(matter, { confidentiality: "public" });
    expect(doc.confidentiality).toBe("confidential");
  });
});

// ── propagateToAiPrompt ───────────────────────────────────────────────

describe("propagateToAiPrompt", () => {
  it("returns none/internal for no matters", () => {
    const label = propagateToAiPrompt([], false, "prompt-1", "user-1");
    expect(label.privilege).toBe("none");
    expect(label.confidentiality).toBe("internal");
    expect(label.includes_matter_data).toBe(false);
  });

  it("inherits highest privilege from multiple matters", () => {
    const matters = [
      makeMatterLabel({ case_slug: "c1", privilege: "none", confidentiality: "internal" }),
      makeMatterLabel({
        case_slug: "c2",
        privilege: "attorney_client",
        confidentiality: "confidential",
      }),
    ];
    const label = propagateToAiPrompt(matters, true, "prompt-1", "user-1");
    expect(label.privilege).toBe("attorney_client");
    expect(label.confidentiality).toBe("confidential");
    expect(label.includes_matter_data).toBe(true);
  });

  it("uses first matter's case_slug", () => {
    const matters = [makeMatterLabel({ case_slug: "c1" }), makeMatterLabel({ case_slug: "c2" })];
    const label = propagateToAiPrompt(matters, true, "prompt-1", "user-1");
    expect(label.case_slug).toBe("c1");
  });
});

// ── propagateToExport ─────────────────────────────────────────────────

describe("propagateToExport", () => {
  it("returns none/internal for no matters", () => {
    const label = propagateToExport([], "exp-1", "pdf");
    expect(label.privilege).toBe("none");
    expect(label.confidentiality).toBe("internal");
    expect(label.case_slugs).toHaveLength(0);
  });

  it("inherits highest privilege from matters", () => {
    const matters = [
      makeMatterLabel({ case_slug: "c1", privilege: "work_product", confidentiality: "internal" }),
      makeMatterLabel({
        case_slug: "c2",
        privilege: "attorney_client",
        confidentiality: "restricted",
      }),
    ];
    const label = propagateToExport(matters, "exp-1", "pdf", "client@example.com");
    expect(label.privilege).toBe("attorney_client");
    expect(label.confidentiality).toBe("restricted");
    expect(label.case_slugs).toEqual(["c1", "c2"]);
    expect(label.recipient).toBe("client@example.com");
  });

  it("supports different formats", () => {
    const matters = [makeMatterLabel()];
    const label = propagateToExport(matters, "exp-1", "datev");
    expect(label.format).toBe("datev");
  });
});

// ── inferConfidentialityFromPermissions ───────────────────────────────

describe("inferConfidentialityFromPermissions", () => {
  it("returns internal for undefined permissions", () => {
    expect(inferConfidentialityFromPermissions(undefined)).toBe("internal");
  });

  it("returns restricted when blocked_users present", () => {
    const perm = makePermissionInfo({ blocked_users: ["user-1"] });
    expect(inferConfidentialityFromPermissions(perm)).toBe("restricted");
  });

  it("returns confidential for visibility=confidential", () => {
    const perm = makePermissionInfo({ visibility: "confidential" });
    expect(inferConfidentialityFromPermissions(perm)).toBe("confidential");
  });

  it("returns confidential for visibility=restricted", () => {
    const perm = makePermissionInfo({ visibility: "restricted" });
    expect(inferConfidentialityFromPermissions(perm)).toBe("confidential");
  });

  it("returns internal for visibility=full", () => {
    const perm = makePermissionInfo({ visibility: "full" });
    expect(inferConfidentialityFromPermissions(perm)).toBe("internal");
  });
});

// ── inferPrivilegeFromPermissions ─────────────────────────────────────

describe("inferPrivilegeFromPermissions", () => {
  it("returns none for undefined permissions", () => {
    expect(inferPrivilegeFromPermissions(undefined)).toBe("none");
  });

  it("returns attorney_client when privileged=true", () => {
    const perm = makePermissionInfo({ privileged: true });
    expect(inferPrivilegeFromPermissions(perm)).toBe("attorney_client");
  });

  it("returns none when privileged=false", () => {
    const perm = makePermissionInfo({ privileged: false });
    expect(inferPrivilegeFromPermissions(perm)).toBe("none");
  });
});

// ── shouldRedactForExport ─────────────────────────────────────────────

describe("shouldRedactForExport", () => {
  it("redacts attorney_client for opponent", () => {
    const label = propagateToExport(
      [makeMatterLabel({ privilege: "attorney_client" })],
      "exp-1",
      "pdf"
    );
    const result = shouldRedactForExport(label, "opponent");
    expect(result.redacted).toBe(true);
    expect(result.fields_redacted).toContain("internal_notes");
    expect(result.fields_redacted).toContain("legal_assessment");
    expect(result.fields_redacted).toContain("strategy");
  });

  it("does not redact attorney_client for client", () => {
    const label = propagateToExport(
      [makeMatterLabel({ privilege: "attorney_client" })],
      "exp-1",
      "pdf"
    );
    const result = shouldRedactForExport(label, "client");
    expect(result.redacted).toBe(false);
  });

  it("redacts work_product for opponent", () => {
    const label = propagateToExport(
      [makeMatterLabel({ privilege: "work_product" })],
      "exp-1",
      "pdf"
    );
    const result = shouldRedactForExport(label, "opponent");
    expect(result.redacted).toBe(true);
    expect(result.fields_redacted).toContain("work_product_notes");
  });

  it("redacts work_product for court", () => {
    const label = propagateToExport(
      [makeMatterLabel({ privilege: "work_product" })],
      "exp-1",
      "pdf"
    );
    const result = shouldRedactForExport(label, "court");
    expect(result.redacted).toBe(true);
  });

  it("redacts restricted for external", () => {
    const label = propagateToExport(
      [makeMatterLabel({ confidentiality: "restricted" })],
      "exp-1",
      "pdf"
    );
    const result = shouldRedactForExport(label, "external");
    expect(result.redacted).toBe(true);
    expect(result.fields_redacted).toContain("all_matter_data");
  });

  it("redacts confidential for opponent", () => {
    const label = propagateToExport(
      [makeMatterLabel({ confidentiality: "confidential", privilege: "none" })],
      "exp-1",
      "pdf"
    );
    const result = shouldRedactForExport(label, "opponent");
    expect(result.redacted).toBe(true);
    expect(result.fields_redacted).toContain("confidential_sections");
  });

  it("does not redact public for anyone", () => {
    const label = propagateToExport(
      [makeMatterLabel({ confidentiality: "public", privilege: "none" })],
      "exp-1",
      "pdf"
    );
    const result = shouldRedactForExport(label, "opponent");
    expect(result.redacted).toBe(false);
  });

  it("does not redact internal for court", () => {
    const label = propagateToExport(
      [makeMatterLabel({ confidentiality: "internal", privilege: "none" })],
      "exp-1",
      "pdf"
    );
    const result = shouldRedactForExport(label, "court");
    expect(result.redacted).toBe(false);
  });
});

// ── validatePrivilegeLabel ────────────────────────────────────────────

describe("validatePrivilegeLabel", () => {
  it("valid label passes", () => {
    const label: PrivilegeLabel = {
      privilege: "attorney_client",
      confidentiality: "confidential",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    const result = validatePrivilegeLabel(label);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("missing labeled_at fails", () => {
    const label: PrivilegeLabel = {
      privilege: "none",
      confidentiality: "internal",
      labeled_at: "",
      labeled_by: "user-1",
    };
    const result = validatePrivilegeLabel(label);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("labeled_at is required");
  });

  it("missing labeled_by fails", () => {
    const label: PrivilegeLabel = {
      privilege: "none",
      confidentiality: "internal",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "",
    };
    const result = validatePrivilegeLabel(label);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("labeled_by is required");
  });
});

// ── canShareWith ──────────────────────────────────────────────────────

describe("canShareWith", () => {
  it("attorney_client shareable with client", () => {
    const label: PrivilegeLabel = {
      privilege: "attorney_client",
      confidentiality: "confidential",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    expect(canShareWith(label, "client").allowed).toBe(true);
  });

  it("attorney_client not shareable with opponent", () => {
    const label: PrivilegeLabel = {
      privilege: "attorney_client",
      confidentiality: "confidential",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    const result = canShareWith(label, "opponent");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("attorney_client");
  });

  it("attorney_client shareable with internal", () => {
    const label: PrivilegeLabel = {
      privilege: "attorney_client",
      confidentiality: "confidential",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    expect(canShareWith(label, "internal").allowed).toBe(true);
  });

  it("work_product not shareable with court", () => {
    const label: PrivilegeLabel = {
      privilege: "work_product",
      confidentiality: "internal",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    expect(canShareWith(label, "court").allowed).toBe(false);
  });

  it("work_product shareable with internal", () => {
    const label: PrivilegeLabel = {
      privilege: "work_product",
      confidentiality: "internal",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    expect(canShareWith(label, "internal").allowed).toBe(true);
  });

  it("restricted not shareable with external", () => {
    const label: PrivilegeLabel = {
      privilege: "none",
      confidentiality: "restricted",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    expect(canShareWith(label, "external").allowed).toBe(false);
  });

  it("confidential not shareable with opponent", () => {
    const label: PrivilegeLabel = {
      privilege: "none",
      confidentiality: "confidential",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    expect(canShareWith(label, "opponent").allowed).toBe(false);
  });

  it("public shareable with anyone", () => {
    const label: PrivilegeLabel = {
      privilege: "none",
      confidentiality: "public",
      labeled_at: "2026-06-20T12:00:00Z",
      labeled_by: "user-1",
    };
    expect(canShareWith(label, "opponent").allowed).toBe(true);
    expect(canShareWith(label, "external").allowed).toBe(true);
    expect(canShareWith(label, "court").allowed).toBe(true);
  });
});
