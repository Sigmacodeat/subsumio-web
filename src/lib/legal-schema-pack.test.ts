import { describe, it, expect } from "vitest";
import {
  LEGAL_SCHEMA_PACK,
  LEGAL_PAGE_TYPES,
  LEGAL_LINK_VERBS,
  LEGAL_FRONTMATTER_SCHEMAS,
  LEGAL_ENTITY_TYPES,
  LEGAL_DEADLINE_RULE_KEYS,
  LEGAL_SCHEMA_MIGRATIONS,
  validateSchemaPack,
  getMigrationPath,
  getLatestVersion,
  needsMigration,
  getPageType,
  getLinkVerb,
  getFrontmatterSchema,
  getRequiredFrontmatter,
  getOptionalFrontmatter,
  getOutgoingLinks,
  getIncomingLinks,
  isMatterScoped,
  canBePrivileged,
  isGoBdRelevant,
  getGdprRelevantFields,
  getGoBdRelevantFields,
  getSchemaPackSummary,
} from "@/lib/legal-schema-pack";

describe("Legal Schema Pack — Structure", () => {
  it("has correct id and version", () => {
    expect(LEGAL_SCHEMA_PACK.id).toBe("subsumio-legal");
    expect(LEGAL_SCHEMA_PACK.version).toBe("2.1.0");
  });

  it("has 12+ page types", () => {
    expect(LEGAL_PAGE_TYPES.length).toBeGreaterThanOrEqual(12);
  });

  it("has 10+ link verbs", () => {
    expect(LEGAL_LINK_VERBS.length).toBeGreaterThanOrEqual(10);
  });

  it("has frontmatter schemas for key page types", () => {
    expect(LEGAL_FRONTMATTER_SCHEMAS["case"]).toBeDefined();
    expect(LEGAL_FRONTMATTER_SCHEMAS["document"]).toBeDefined();
    expect(LEGAL_FRONTMATTER_SCHEMAS["person"]).toBeDefined();
    expect(LEGAL_FRONTMATTER_SCHEMAS["deadline"]).toBeDefined();
  });

  it("has 9 entity types", () => {
    expect(LEGAL_ENTITY_TYPES.length).toBe(9);
  });

  it("has 10+ deadline rule keys", () => {
    expect(LEGAL_DEADLINE_RULE_KEYS.length).toBeGreaterThanOrEqual(10);
  });

  it("supports DE, AT, CH jurisdictions", () => {
    expect(LEGAL_SCHEMA_PACK.jurisdictions).toContain("DE");
    expect(LEGAL_SCHEMA_PACK.jurisdictions).toContain("AT");
    expect(LEGAL_SCHEMA_PACK.jurisdictions).toContain("CH");
  });

  it("has migrations", () => {
    expect(LEGAL_SCHEMA_MIGRATIONS.length).toBeGreaterThan(0);
  });
});

describe("Legal Schema Pack — Validation", () => {
  it("passes validation", () => {
    const result = validateSchemaPack(LEGAL_SCHEMA_PACK);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects duplicate page types", () => {
    const pack = {
      ...LEGAL_SCHEMA_PACK,
      page_types: [...LEGAL_SCHEMA_PACK.page_types, { ...LEGAL_PAGE_TYPES[0] }],
    };
    const result = validateSchemaPack(pack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate page type"))).toBe(true);
  });

  it("detects duplicate link verbs", () => {
    const pack = {
      ...LEGAL_SCHEMA_PACK,
      link_verbs: [...LEGAL_SCHEMA_PACK.link_verbs, { ...LEGAL_LINK_VERBS[0] }],
    };
    const result = validateSchemaPack(pack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate link verb"))).toBe(true);
  });

  it("detects missing frontmatter in schema", () => {
    const pack = {
      ...LEGAL_SCHEMA_PACK,
      page_types: [
        ...LEGAL_SCHEMA_PACK.page_types,
        {
          type: "test_missing",
          label: "Test",
          description: "Test",
          required_frontmatter: ["nonexistent_field"],
          optional_frontmatter: [],
          outgoing_links: [],
          incoming_links: [],
          matter_scoped: false,
          can_be_privileged: false,
          gobd_relevant: false,
        },
      ],
    };
    const result = validateSchemaPack(pack);
    expect(result.valid).toBe(false);
  });

  it("detects unordered migrations", () => {
    const pack = {
      ...LEGAL_SCHEMA_PACK,
      migrations: [
        { from_version: "1.0.0", to_version: "1.1.0", description: "first", ddl: [], breaking: false },
        { from_version: "2.0.0", to_version: "2.1.0", description: "gap", ddl: [], breaking: false },
      ],
    };
    const result = validateSchemaPack(pack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("doesn't match previous"))).toBe(true);
  });
});

describe("Legal Schema Pack — Lookup", () => {
  it("getPageType returns matching spec", () => {
    const pt = getPageType(LEGAL_SCHEMA_PACK, "case");
    expect(pt).toBeDefined();
    expect(pt!.type).toBe("case");
    expect(pt!.matter_scoped).toBe(true);
  });

  it("getPageType returns undefined for unknown", () => {
    expect(getPageType(LEGAL_SCHEMA_PACK, "nonexistent")).toBeUndefined();
  });

  it("getLinkVerb returns matching spec", () => {
    const verb = getLinkVerb(LEGAL_SCHEMA_PACK, "has_document");
    expect(verb).toBeDefined();
    expect(verb!.from_types).toContain("case");
  });

  it("getFrontmatterSchema returns fields for page type", () => {
    const schema = getFrontmatterSchema(LEGAL_SCHEMA_PACK, "case");
    expect(schema.length).toBeGreaterThan(0);
    expect(schema.some((f) => f.key === "case_number")).toBe(true);
  });

  it("getRequiredFrontmatter returns required fields", () => {
    const required = getRequiredFrontmatter(LEGAL_SCHEMA_PACK, "case");
    expect(required).toContain("case_number");
    expect(required).toContain("status");
    expect(required).toContain("practice_area");
  });

  it("getOptionalFrontmatter returns optional fields", () => {
    const optional = getOptionalFrontmatter(LEGAL_SCHEMA_PACK, "case");
    expect(optional).toContain("client");
    expect(optional).toContain("court");
  });

  it("getOutgoingLinks returns outgoing verbs", () => {
    const links = getOutgoingLinks(LEGAL_SCHEMA_PACK, "case");
    expect(links).toContain("has_document");
    expect(links).toContain("has_party");
    expect(links).toContain("has_deadline");
  });

  it("getIncomingLinks returns incoming verbs", () => {
    const links = getIncomingLinks(LEGAL_SCHEMA_PACK, "document");
    expect(links).toContain("has_document");
  });

  it("isMatterScoped returns correct value", () => {
    expect(isMatterScoped(LEGAL_SCHEMA_PACK, "case")).toBe(true);
    expect(isMatterScoped(LEGAL_SCHEMA_PACK, "statute")).toBe(false);
  });

  it("canBePrivileged returns correct value", () => {
    expect(canBePrivileged(LEGAL_SCHEMA_PACK, "case")).toBe(true);
    expect(canBePrivileged(LEGAL_SCHEMA_PACK, "statute")).toBe(false);
  });

  it("isGoBdRelevant returns correct value", () => {
    expect(isGoBdRelevant(LEGAL_SCHEMA_PACK, "case")).toBe(true);
    expect(isGoBdRelevant(LEGAL_SCHEMA_PACK, "person")).toBe(false);
  });

  it("getGdprRelevantFields returns GDPR fields", () => {
    const fields = getGdprRelevantFields(LEGAL_SCHEMA_PACK, "person");
    expect(fields.some((f) => f.key === "name")).toBe(true);
    expect(fields.some((f) => f.key === "email")).toBe(true);
  });

  it("getGoBdRelevantFields returns GoBD fields", () => {
    const fields = getGoBdRelevantFields(LEGAL_SCHEMA_PACK, "case");
    expect(fields.some((f) => f.key === "case_number")).toBe(true);
  });
});

describe("Legal Schema Pack — Migrations", () => {
  it("getMigrationPath returns ordered migrations", () => {
    const path = getMigrationPath(LEGAL_SCHEMA_PACK, "1.0.0", "2.0.0");
    expect(path.length).toBeGreaterThan(0);
    expect(path[0].from_version).toBe("1.0.0");
    expect(path[path.length - 1].to_version).toBe("2.0.0");
  });

  it("getMigrationPath returns empty for same version", () => {
    const path = getMigrationPath(LEGAL_SCHEMA_PACK, "2.1.0", "2.1.0");
    expect(path).toHaveLength(0);
  });

  it("getLatestVersion returns pack version", () => {
    expect(getLatestVersion(LEGAL_SCHEMA_PACK)).toBe("2.1.0");
  });

  it("needsMigration returns true for old version", () => {
    expect(needsMigration(LEGAL_SCHEMA_PACK, "1.0.0")).toBe(true);
  });

  it("needsMigration returns false for current version", () => {
    expect(needsMigration(LEGAL_SCHEMA_PACK, "2.1.0")).toBe(false);
  });

  it("migrations are ordered correctly", () => {
    for (let i = 1; i < LEGAL_SCHEMA_MIGRATIONS.length; i++) {
      expect(LEGAL_SCHEMA_MIGRATIONS[i].from_version).toBe(LEGAL_SCHEMA_MIGRATIONS[i - 1].to_version);
    }
  });

  it("last migration reaches current version", () => {
    const last = LEGAL_SCHEMA_MIGRATIONS[LEGAL_SCHEMA_MIGRATIONS.length - 1];
    expect(last.to_version).toBe(LEGAL_SCHEMA_PACK.version);
  });
});

describe("Legal Schema Pack — Summary", () => {
  it("getSchemaPackSummary returns correct stats", () => {
    const summary = getSchemaPackSummary();
    expect(summary.version).toBe("2.1.0");
    expect(summary.page_type_count).toBe(LEGAL_PAGE_TYPES.length);
    expect(summary.link_verb_count).toBe(LEGAL_LINK_VERBS.length);
    expect(summary.entity_type_count).toBe(9);
    expect(summary.jurisdictions).toContain("DE");
  });
});

describe("Legal Schema Pack — Specific Page Type Checks", () => {
  it("case page type has correct required fields", () => {
    const required = getRequiredFrontmatter(LEGAL_SCHEMA_PACK, "case");
    expect(required).toEqual(expect.arrayContaining(["case_number", "status", "practice_area"]));
  });

  it("deadline page type is matter-scoped and GoBD-relevant", () => {
    expect(isMatterScoped(LEGAL_SCHEMA_PACK, "deadline")).toBe(true);
    expect(isGoBdRelevant(LEGAL_SCHEMA_PACK, "deadline")).toBe(true);
  });

  it("bea_message page type exists", () => {
    const bea = getPageType(LEGAL_SCHEMA_PACK, "bea_message");
    expect(bea).toBeDefined();
    expect(bea!.gobd_relevant).toBe(true);
  });

  it("communication page type has channel enum", () => {
    const schema = getFrontmatterSchema(LEGAL_SCHEMA_PACK, "communication");
    const channelField = schema.find((f) => f.key === "channel");
    expect(channelField).toBeDefined();
    expect(channelField!.enum_values).toContain("email");
    expect(channelField!.enum_values).toContain("bea");
    expect(channelField!.enum_values).toContain("whatsapp");
  });

  it("fact page type has confidence enum", () => {
    const schema = getFrontmatterSchema(LEGAL_SCHEMA_PACK, "fact");
    const confidenceField = schema.find((f) => f.key === "confidence");
    expect(confidenceField).toBeDefined();
    expect(confidenceField!.enum_values).toEqual(["high", "medium", "low"]);
  });

  it("has_communication link verb connects case to communication", () => {
    const verb = getLinkVerb(LEGAL_SCHEMA_PACK, "has_communication");
    expect(verb).toBeDefined();
    expect(verb!.from_types).toContain("case");
    expect(verb!.to_types).toContain("communication");
  });
});
