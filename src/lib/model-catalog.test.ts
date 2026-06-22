import { describe, it, expect } from "vitest";
import {
  DOMAIN_MODELS,
  DOMAIN_LABELS,
  getDomainModel,
  getAllDomains,
  getDomainsByEntityClass,
  getDomainForPageType,
  getRequiredFields,
  getOptionalFields,
  getPiiFieldsForDomain,
  getDependencies,
  getDependents,
  isGoBdRelevant,
  isGdprRelevant,
  getCatalogSummary,
  type DomainName,
} from "@/lib/model-catalog";

// ── DOMAIN_LABELS ─────────────────────────────────────────────────────

describe("DOMAIN_LABELS", () => {
  it("has labels for all 8 domains", () => {
    expect(Object.keys(DOMAIN_LABELS)).toHaveLength(8);
    expect(DOMAIN_LABELS.source_registry).toBe("Rechtsquellen-Register");
    expect(DOMAIN_LABELS.workflows).toBe("Workflows");
    expect(DOMAIN_LABELS.review_sets).toBe("Contract Review");
    expect(DOMAIN_LABELS.filing_packages).toBe("GoBD-Aktenexport");
    expect(DOMAIN_LABELS.ethics_aml).toBe("Compliance & Ethics");
    expect(DOMAIN_LABELS.analytics).toBe("Analytics & Reporting");
    expect(DOMAIN_LABELS.collaboration).toBe("Zusammenarbeit");
    expect(DOMAIN_LABELS.migration).toBe("Migration & Import");
  });
});

// ── DOMAIN_MODELS Registry ────────────────────────────────────────────

describe("DOMAIN_MODELS", () => {
  it("has all 8 domains", () => {
    expect(Object.keys(DOMAIN_MODELS)).toHaveLength(8);
    expect(DOMAIN_MODELS.source_registry).toBeDefined();
    expect(DOMAIN_MODELS.workflows).toBeDefined();
    expect(DOMAIN_MODELS.review_sets).toBeDefined();
    expect(DOMAIN_MODELS.filing_packages).toBeDefined();
    expect(DOMAIN_MODELS.ethics_aml).toBeDefined();
    expect(DOMAIN_MODELS.analytics).toBeDefined();
    expect(DOMAIN_MODELS.collaboration).toBeDefined();
    expect(DOMAIN_MODELS.migration).toBeDefined();
  });

  it("every domain has required metadata", () => {
    for (const domain of Object.keys(DOMAIN_MODELS) as DomainName[]) {
      const entry = DOMAIN_MODELS[domain];
      expect(entry.domain).toBe(domain);
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.pageTypes.length).toBeGreaterThan(0);
      expect(entry.entityClass).toBeTruthy();
      expect(entry.owner).toBeTruthy();
      expect(entry.apiRoute).toBeTruthy();
      expect(entry.fields.length).toBeGreaterThan(0);
      expect(typeof entry.gobdRelevant).toBe("boolean");
      expect(typeof entry.gdprRelevant).toBe("boolean");
    }
  });

  it("every field has valid type and cardinality", () => {
    const validTypes = [
      "string",
      "text",
      "number",
      "boolean",
      "date",
      "enum",
      "json",
      "ref",
      "slug",
    ];
    const validCardinalities = ["one", "many", "optional"];
    for (const domain of Object.keys(DOMAIN_MODELS) as DomainName[]) {
      for (const field of DOMAIN_MODELS[domain].fields) {
        expect(validTypes).toContain(field.type);
        expect(validCardinalities).toContain(field.cardinality);
        expect(field.name).toBeTruthy();
        expect(field.description).toBeTruthy();
      }
    }
  });

  it("enum fields have enumValues", () => {
    for (const domain of Object.keys(DOMAIN_MODELS) as DomainName[]) {
      for (const field of DOMAIN_MODELS[domain].fields) {
        if (field.type === "enum") {
          expect(field.enumValues).toBeDefined();
          expect(field.enumValues!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("ref fields have refDomain", () => {
    for (const domain of Object.keys(DOMAIN_MODELS) as DomainName[]) {
      for (const field of DOMAIN_MODELS[domain].fields) {
        if (field.type === "ref") {
          expect(field.refDomain).toBeDefined();
        }
      }
    }
  });

  it("filing_packages is GoBD-relevant", () => {
    expect(DOMAIN_MODELS.filing_packages.gobdRelevant).toBe(true);
  });

  it("ethics_aml is GoBD-relevant", () => {
    expect(DOMAIN_MODELS.ethics_aml.gobdRelevant).toBe(true);
  });

  it("review_sets is GDPR-relevant", () => {
    expect(DOMAIN_MODELS.review_sets.gdprRelevant).toBe(true);
  });

  it("analytics is neither GoBD nor GDPR relevant", () => {
    expect(DOMAIN_MODELS.analytics.gobdRelevant).toBe(false);
    expect(DOMAIN_MODELS.analytics.gdprRelevant).toBe(false);
  });
});

// ── getDomainModel ────────────────────────────────────────────────────

describe("getDomainModel", () => {
  it("returns model for each domain", () => {
    const model = getDomainModel("source_registry");
    expect(model.domain).toBe("source_registry");
    expect(model.name).toBe("SourceRegistryEntry");
  });
});

// ── getAllDomains ─────────────────────────────────────────────────────

describe("getAllDomains", () => {
  it("returns all 8 domains", () => {
    const domains = getAllDomains();
    expect(domains).toHaveLength(8);
    expect(domains).toContain("source_registry");
    expect(domains).toContain("migration");
  });
});

// ── getDomainsByEntityClass ───────────────────────────────────────────

describe("getDomainsByEntityClass", () => {
  it("returns domains for brain_page", () => {
    const domains = getDomainsByEntityClass("brain_page");
    expect(domains.length).toBeGreaterThan(0);
    expect(domains).toContain("source_registry");
    expect(domains).toContain("review_sets");
  });

  it("returns filing_packages for file_object", () => {
    const domains = getDomainsByEntityClass("file_object");
    expect(domains).toContain("filing_packages");
  });

  it("returns analytics for relational_table", () => {
    const domains = getDomainsByEntityClass("relational_table");
    expect(domains).toContain("analytics");
  });

  it("returns migration for event_audit", () => {
    const domains = getDomainsByEntityClass("event_audit");
    expect(domains).toContain("migration");
  });
});

// ── getDomainForPageType ──────────────────────────────────────────────

describe("getDomainForPageType", () => {
  it("returns source_registry for statute", () => {
    const domain = getDomainForPageType("statute");
    expect(domain?.domain).toBe("source_registry");
  });

  it("returns review_sets for clause_annotation", () => {
    const domain = getDomainForPageType("clause_annotation");
    expect(domain?.domain).toBe("review_sets");
  });

  it("returns workflows for workflow", () => {
    const domain = getDomainForPageType("workflow");
    expect(domain?.domain).toBe("workflows");
  });

  it("returns null for unknown page type", () => {
    expect(getDomainForPageType("nonexistent")).toBeNull();
  });
});

// ── getRequiredFields / getOptionalFields ─────────────────────────────

describe("getRequiredFields", () => {
  it("returns only required fields", () => {
    const fields = getRequiredFields("review_sets");
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((f) => f.required)).toBe(true);
  });
});

describe("getOptionalFields", () => {
  it("returns only optional fields", () => {
    const fields = getOptionalFields("review_sets");
    expect(fields.every((f) => !f.required)).toBe(true);
  });
});

// ── getPiiFieldsForDomain ─────────────────────────────────────────────

describe("getPiiFieldsForDomain", () => {
  it("returns PII fields for review_sets", () => {
    const piiFields = getPiiFieldsForDomain("review_sets");
    expect(piiFields.length).toBeGreaterThan(0);
    expect(piiFields.some((f) => f.name === "annotated_by")).toBe(true);
  });

  it("returns empty array for analytics (no PII)", () => {
    const piiFields = getPiiFieldsForDomain("analytics");
    expect(piiFields).toHaveLength(0);
  });
});

// ── getDependencies / getDependents ───────────────────────────────────

describe("getDependencies", () => {
  it("returns dependencies for workflows", () => {
    const deps = getDependencies("workflows");
    expect(deps).toContain("review_sets");
    expect(deps).toContain("collaboration");
  });

  it("returns empty array for source_registry", () => {
    expect(getDependencies("source_registry")).toHaveLength(0);
  });
});

describe("getDependents", () => {
  it("returns domains that depend on review_sets", () => {
    const dependents = getDependents("review_sets");
    expect(dependents).toContain("workflows");
    expect(dependents).toContain("filing_packages");
    expect(dependents).toContain("ethics_aml");
    expect(dependents).toContain("collaboration");
  });

  it("returns empty array for migration (no dependents)", () => {
    expect(getDependents("migration")).toHaveLength(0);
  });
});

// ── isGoBdRelevant / isGdprRelevant ───────────────────────────────────

describe("isGoBdRelevant", () => {
  it("returns true for filing_packages", () => {
    expect(isGoBdRelevant("filing_packages")).toBe(true);
  });

  it("returns false for source_registry", () => {
    expect(isGoBdRelevant("source_registry")).toBe(false);
  });
});

describe("isGdprRelevant", () => {
  it("returns true for review_sets", () => {
    expect(isGdprRelevant("review_sets")).toBe(true);
  });

  it("returns false for analytics", () => {
    expect(isGdprRelevant("analytics")).toBe(false);
  });
});

// ── getCatalogSummary ─────────────────────────────────────────────────

describe("getCatalogSummary", () => {
  it("returns correct summary", () => {
    const summary = getCatalogSummary();
    expect(summary.total_domains).toBe(8);
    expect(summary.total_fields).toBeGreaterThan(0);
    expect(summary.gobd_relevant_count).toBeGreaterThan(0);
    expect(summary.gdpr_relevant_count).toBeGreaterThan(0);
    expect(summary.domains).toHaveLength(8);
  });

  it("by_entity_class covers multiple classes", () => {
    const summary = getCatalogSummary();
    expect(Object.keys(summary.by_entity_class).length).toBeGreaterThanOrEqual(3);
  });
});
