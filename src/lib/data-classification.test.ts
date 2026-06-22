import { describe, it, expect } from "vitest";
import {
  DATA_CLASSIFICATIONS,
  SENSITIVITY_LABELS,
  SENSITIVITY_RANK,
  ENTITY_CLASS_LABELS,
  RETENTION_ACTION_LABELS,
  getClassification,
  inferEntityClass,
  getClassificationForPage,
  meetsSensitivity,
  isImmutable,
  isGobdRelevant,
  isGdprRelevant,
  getPiiFields,
  isPiiField,
  maskPiiValue,
  filterBySensitivity,
  getGobdRelevantClasses,
  getGdprRelevantClasses,
  validateTenantScope,
  isSameOrg,
  isSameBrain,
  parseDurationToMs,
  calculateRetentionExpiry,
  isRetentionExpired,
  getRetentionAction,
  getPageTypes,
  pageTypeBelongsTo,
  getClassificationSummary,
  type EntityClass,
  type TenantScope,
} from "@/lib/data-classification";

// ── Constants & Labels ────────────────────────────────────────────────

describe("Constants & Labels", () => {
  it("has 4 sensitivity levels", () => {
    expect(Object.keys(SENSITIVITY_LABELS)).toHaveLength(4);
    expect(SENSITIVITY_LABELS.public).toBe("Öffentlich");
    expect(SENSITIVITY_LABELS.internal).toBe("Intern");
    expect(SENSITIVITY_LABELS.confidential).toBe("Vertraulich");
    expect(SENSITIVITY_LABELS.restricted).toBe("Streng vertraulich");
  });

  it("ranks sensitivities correctly", () => {
    expect(SENSITIVITY_RANK.public).toBe(0);
    expect(SENSITIVITY_RANK.internal).toBe(1);
    expect(SENSITIVITY_RANK.confidential).toBe(2);
    expect(SENSITIVITY_RANK.restricted).toBe(3);
    expect(SENSITIVITY_RANK.public).toBeLessThan(SENSITIVITY_RANK.restricted);
  });

  it("has 5 entity class labels", () => {
    expect(Object.keys(ENTITY_CLASS_LABELS)).toHaveLength(5);
    expect(ENTITY_CLASS_LABELS.brain_page).toBe("Brain Page");
    expect(ENTITY_CLASS_LABELS.ai_run).toContain("AI-Run");
  });

  it("has 4 retention action labels", () => {
    expect(Object.keys(RETENTION_ACTION_LABELS)).toHaveLength(4);
    expect(RETENTION_ACTION_LABELS.keep).toBe("Aufbewahren");
    expect(RETENTION_ACTION_LABELS.delete).toBe("Löschen");
    expect(RETENTION_ACTION_LABELS.anonymize).toBe("Anonymisieren");
  });
});

// ── DATA_CLASSIFICATIONS Registry ─────────────────────────────────────

describe("DATA_CLASSIFICATIONS", () => {
  it("has all 5 entity classes", () => {
    expect(Object.keys(DATA_CLASSIFICATIONS)).toHaveLength(5);
    expect(DATA_CLASSIFICATIONS.brain_page).toBeDefined();
    expect(DATA_CLASSIFICATIONS.relational_table).toBeDefined();
    expect(DATA_CLASSIFICATIONS.file_object).toBeDefined();
    expect(DATA_CLASSIFICATIONS.event_audit).toBeDefined();
    expect(DATA_CLASSIFICATIONS.ai_run).toBeDefined();
  });

  it("brain_page is confidential with indefinite retention", () => {
    const c = DATA_CLASSIFICATIONS.brain_page;
    expect(c.sensitivity).toBe("confidential");
    expect(c.retention.retention).toBe("indefinite");
    expect(c.retention.action).toBe("keep");
    expect(c.immutable).toBe(false);
    expect(c.gdpr_relevant).toBe(true);
  });

  it("relational_table is confidential with 10-year retention", () => {
    const c = DATA_CLASSIFICATIONS.relational_table;
    expect(c.sensitivity).toBe("confidential");
    expect(c.retention.retention).toBe("P10Y");
    expect(c.retention.action).toBe("archive");
    expect(c.gobd_relevant).toBe(true);
  });

  it("file_object is restricted", () => {
    const c = DATA_CLASSIFICATIONS.file_object;
    expect(c.sensitivity).toBe("restricted");
    expect(c.retention.retention).toBe("P10Y");
    expect(c.gobd_relevant).toBe(true);
  });

  it("event_audit is immutable", () => {
    const c = DATA_CLASSIFICATIONS.event_audit;
    expect(c.sensitivity).toBe("internal");
    expect(c.immutable).toBe(true);
    expect(c.gobd_relevant).toBe(true);
    expect(c.gdpr_relevant).toBe(false);
  });

  it("ai_run has 90-day retention with anonymize", () => {
    const c = DATA_CLASSIFICATIONS.ai_run;
    expect(c.sensitivity).toBe("confidential");
    expect(c.retention.retention).toBe("P90D");
    expect(c.retention.action).toBe("anonymize");
    expect(c.gdpr_relevant).toBe(true);
  });

  it("all classes have tenant_isolation = true", () => {
    for (const ec of Object.keys(DATA_CLASSIFICATIONS) as EntityClass[]) {
      expect(DATA_CLASSIFICATIONS[ec].tenant_isolation).toBe(true);
    }
  });

  it("all classes have at least one PII field", () => {
    for (const ec of Object.keys(DATA_CLASSIFICATIONS) as EntityClass[]) {
      expect(DATA_CLASSIFICATIONS[ec].pii_fields.length).toBeGreaterThan(0);
    }
  });

  it("all classes have legal_basis in retention", () => {
    for (const ec of Object.keys(DATA_CLASSIFICATIONS) as EntityClass[]) {
      expect(DATA_CLASSIFICATIONS[ec].retention.legal_basis).toBeTruthy();
    }
  });
});

// ── getClassification ─────────────────────────────────────────────────

describe("getClassification", () => {
  it("returns classification for each entity class", () => {
    const c = getClassification("brain_page");
    expect(c.entity_class).toBe("brain_page");
    expect(c.sensitivity).toBe("confidential");
  });

  it("returns immutable=true for event_audit", () => {
    expect(getClassification("event_audit").immutable).toBe(true);
  });
});

// ── inferEntityClass ──────────────────────────────────────────────────

describe("inferEntityClass", () => {
  it("infers event_audit for audit_log", () => {
    expect(inferEntityClass("audit_log")).toBe("event_audit");
  });

  it("infers ai_run for ai_run and query_log", () => {
    expect(inferEntityClass("ai_run")).toBe("ai_run");
    expect(inferEntityClass("query_log")).toBe("ai_run");
  });

  it("infers file_object for document, evidence, receipt", () => {
    expect(inferEntityClass("document")).toBe("file_object");
    expect(inferEntityClass("evidence")).toBe("file_object");
    expect(inferEntityClass("receipt")).toBe("file_object");
  });

  it("infers relational_table for time_entry, expense, deadline", () => {
    expect(inferEntityClass("time_entry")).toBe("relational_table");
    expect(inferEntityClass("expense")).toBe("relational_table");
    expect(inferEntityClass("deadline")).toBe("relational_table");
  });

  it("defaults to brain_page for unknown types", () => {
    expect(inferEntityClass("case")).toBe("brain_page");
    expect(inferEntityClass("note")).toBe("brain_page");
    expect(inferEntityClass("invoice")).toBe("brain_page");
  });

  it("defaults to brain_page for undefined", () => {
    expect(inferEntityClass(undefined)).toBe("brain_page");
  });
});

// ── getClassificationForPage ──────────────────────────────────────────

describe("getClassificationForPage", () => {
  it("returns classification based on page type", () => {
    expect(getClassificationForPage("audit_log").entity_class).toBe("event_audit");
    expect(getClassificationForPage("time_entry").entity_class).toBe("relational_table");
    expect(getClassificationForPage("document").entity_class).toBe("file_object");
    expect(getClassificationForPage("case").entity_class).toBe("brain_page");
  });
});

// ── meetsSensitivity ──────────────────────────────────────────────────

describe("meetsSensitivity", () => {
  it("public does not meet internal", () => {
    expect(meetsSensitivity("public", "internal")).toBe(false);
  });

  it("restricted meets all levels", () => {
    expect(meetsSensitivity("restricted", "public")).toBe(true);
    expect(meetsSensitivity("restricted", "internal")).toBe(true);
    expect(meetsSensitivity("restricted", "confidential")).toBe(true);
    expect(meetsSensitivity("restricted", "restricted")).toBe(true);
  });

  it("confidential meets confidential but not restricted", () => {
    expect(meetsSensitivity("confidential", "confidential")).toBe(true);
    expect(meetsSensitivity("confidential", "restricted")).toBe(false);
  });

  it("same level meets", () => {
    expect(meetsSensitivity("internal", "internal")).toBe(true);
  });
});

// ── isImmutable / isGobdRelevant / isGdprRelevant ──────────────────────

describe("isImmutable", () => {
  it("returns true for event_audit", () => {
    expect(isImmutable("event_audit")).toBe(true);
  });

  it("returns false for brain_page", () => {
    expect(isImmutable("brain_page")).toBe(false);
    expect(isImmutable("ai_run")).toBe(false);
  });
});

describe("isGobdRelevant", () => {
  it("returns true for relational_table, file_object, event_audit", () => {
    expect(isGobdRelevant("relational_table")).toBe(true);
    expect(isGobdRelevant("file_object")).toBe(true);
    expect(isGobdRelevant("event_audit")).toBe(true);
  });

  it("returns false for brain_page, ai_run", () => {
    expect(isGobdRelevant("brain_page")).toBe(false);
    expect(isGobdRelevant("ai_run")).toBe(false);
  });
});

describe("isGdprRelevant", () => {
  it("returns true for brain_page, relational_table, file_object, ai_run", () => {
    expect(isGdprRelevant("brain_page")).toBe(true);
    expect(isGdprRelevant("relational_table")).toBe(true);
    expect(isGdprRelevant("file_object")).toBe(true);
    expect(isGdprRelevant("ai_run")).toBe(true);
  });

  it("returns false for event_audit", () => {
    expect(isGdprRelevant("event_audit")).toBe(false);
  });
});

// ── PII Fields ────────────────────────────────────────────────────────

describe("getPiiFields", () => {
  it("returns PII fields for brain_page", () => {
    const fields = getPiiFields("brain_page");
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f.field === "content")).toBe(true);
  });

  it("returns PII fields for ai_run with prompt and response", () => {
    const fields = getPiiFields("ai_run");
    expect(fields.some((f) => f.field === "prompt")).toBe(true);
    expect(fields.some((f) => f.field === "response")).toBe(true);
  });
});

describe("isPiiField", () => {
  it("returns true for known PII field", () => {
    expect(isPiiField("brain_page", "content")).toBe(true);
  });

  it("returns false for unknown field", () => {
    expect(isPiiField("brain_page", "nonexistent")).toBe(false);
  });
});

// ── maskPiiValue ──────────────────────────────────────────────────────

describe("maskPiiValue", () => {
  it("masks long values with first 2 and last 2 chars", () => {
    expect(maskPiiValue("secret@example.com")).toBe("se***om");
  });

  it("masks short values completely", () => {
    expect(maskPiiValue("ab")).toBe("***");
    expect(maskPiiValue("abcd")).toBe("***");
  });

  it("masks 5-char value", () => {
    expect(maskPiiValue("abcde")).toBe("ab***de");
  });
});

// ── filterBySensitivity ───────────────────────────────────────────────

describe("filterBySensitivity", () => {
  it("returns classes with confidential sensitivity", () => {
    const classes = filterBySensitivity("confidential");
    expect(classes).toContain("brain_page");
    expect(classes).toContain("relational_table");
    expect(classes).toContain("ai_run");
    expect(classes).not.toContain("event_audit");
  });

  it("returns restricted classes", () => {
    const classes = filterBySensitivity("restricted");
    expect(classes).toEqual(["file_object"]);
  });

  it("returns internal classes", () => {
    const classes = filterBySensitivity("internal");
    expect(classes).toEqual(["event_audit"]);
  });

  it("returns empty for public", () => {
    expect(filterBySensitivity("public")).toEqual([]);
  });
});

// ── getGobdRelevantClasses / getGdprRelevantClasses ───────────────────

describe("getGobdRelevantClasses", () => {
  it("returns 3 GoBD-relevant classes", () => {
    const classes = getGobdRelevantClasses();
    expect(classes).toHaveLength(3);
    expect(classes).toContain("relational_table");
    expect(classes).toContain("file_object");
    expect(classes).toContain("event_audit");
  });
});

describe("getGdprRelevantClasses", () => {
  it("returns 4 GDPR-relevant classes", () => {
    const classes = getGdprRelevantClasses();
    expect(classes).toHaveLength(4);
    expect(classes).not.toContain("event_audit");
  });
});

// ── validateTenantScope ───────────────────────────────────────────────

describe("validateTenantScope", () => {
  it("validates a complete scope", () => {
    const scope: TenantScope = { brain_id: "b1", org_id: "o1" };
    const result = validateTenantScope(scope);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports missing brain_id", () => {
    const result = validateTenantScope({ brain_id: "", org_id: "o1" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("brain_id is required");
  });

  it("reports missing org_id", () => {
    const result = validateTenantScope({ brain_id: "b1", org_id: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("org_id is required");
  });

  it("reports both missing", () => {
    const result = validateTenantScope({ brain_id: "", org_id: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

// ── isSameOrg / isSameBrain ───────────────────────────────────────────

describe("isSameOrg", () => {
  it("returns true for same org", () => {
    expect(isSameOrg({ brain_id: "b1", org_id: "o1" }, { brain_id: "b2", org_id: "o1" })).toBe(
      true
    );
  });

  it("returns false for different org", () => {
    expect(isSameOrg({ brain_id: "b1", org_id: "o1" }, { brain_id: "b1", org_id: "o2" })).toBe(
      false
    );
  });
});

describe("isSameBrain", () => {
  it("returns true for same brain and org", () => {
    expect(isSameBrain({ brain_id: "b1", org_id: "o1" }, { brain_id: "b1", org_id: "o1" })).toBe(
      true
    );
  });

  it("returns false for different brain", () => {
    expect(isSameBrain({ brain_id: "b1", org_id: "o1" }, { brain_id: "b2", org_id: "o1" })).toBe(
      false
    );
  });

  it("returns false for different org", () => {
    expect(isSameBrain({ brain_id: "b1", org_id: "o1" }, { brain_id: "b1", org_id: "o2" })).toBe(
      false
    );
  });
});

// ── parseDurationToMs ─────────────────────────────────────────────────

describe("parseDurationToMs", () => {
  it("returns null for indefinite", () => {
    expect(parseDurationToMs("indefinite")).toBeNull();
  });

  it("parses P90D", () => {
    const ms = parseDurationToMs("P90D");
    expect(ms).not.toBeNull();
    expect(ms! / (24 * 60 * 60 * 1000)).toBeCloseTo(90, 0);
  });

  it("parses P10Y", () => {
    const ms = parseDurationToMs("P10Y");
    expect(ms).not.toBeNull();
    expect(ms! / (365.25 * 24 * 60 * 60 * 1000)).toBeCloseTo(10, 0);
  });

  it("parses P1Y6M", () => {
    const ms = parseDurationToMs("P1Y6M");
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(0);
  });

  it("returns null for invalid format", () => {
    expect(parseDurationToMs("invalid")).toBeNull();
    expect(parseDurationToMs("90D")).toBeNull();
    expect(parseDurationToMs("")).toBeNull();
  });
});

// ── calculateRetentionExpiry ──────────────────────────────────────────

describe("calculateRetentionExpiry", () => {
  it("returns null for indefinite retention", () => {
    expect(calculateRetentionExpiry("2026-01-01", "brain_page")).toBeNull();
  });

  it("calculates expiry for P90D (ai_run)", () => {
    const expiry = calculateRetentionExpiry("2026-01-01", "ai_run");
    expect(expiry).not.toBeNull();
    const diff = (expiry!.getTime() - new Date("2026-01-01").getTime()) / (24 * 60 * 60 * 1000);
    expect(diff).toBeCloseTo(90, 0);
  });

  it("calculates expiry for P10Y (relational_table)", () => {
    const expiry = calculateRetentionExpiry("2026-01-01", "relational_table");
    expect(expiry).not.toBeNull();
    const diffYears =
      (expiry!.getTime() - new Date("2026-01-01").getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(diffYears).toBeCloseTo(10, 0);
  });
});

// ── isRetentionExpired ────────────────────────────────────────────────

describe("isRetentionExpired", () => {
  it("returns false for indefinite retention", () => {
    expect(isRetentionExpired("2020-01-01", "brain_page")).toBe(false);
  });

  it("returns true for past expiry", () => {
    const oldDate = "2020-01-01";
    expect(isRetentionExpired(oldDate, "ai_run", new Date("2026-06-20"))).toBe(true);
  });

  it("returns false for future expiry", () => {
    const recentDate = "2026-06-01";
    expect(isRetentionExpired(recentDate, "ai_run", new Date("2026-06-20"))).toBe(false);
  });
});

// ── getRetentionAction ────────────────────────────────────────────────

describe("getRetentionAction", () => {
  it("returns keep for brain_page", () => {
    expect(getRetentionAction("brain_page")).toBe("keep");
  });

  it("returns archive for relational_table", () => {
    expect(getRetentionAction("relational_table")).toBe("archive");
  });

  it("returns anonymize for ai_run", () => {
    expect(getRetentionAction("ai_run")).toBe("anonymize");
  });

  it("returns keep for event_audit", () => {
    expect(getRetentionAction("event_audit")).toBe("keep");
  });
});

// ── getPageTypes / pageTypeBelongsTo ──────────────────────────────────

describe("getPageTypes", () => {
  it("returns page types for brain_page", () => {
    const types = getPageTypes("brain_page");
    expect(types).toContain("case");
    expect(types).toContain("invoice");
    expect(types).toContain("workflow");
  });

  it("returns page types for ai_run", () => {
    expect(getPageTypes("ai_run")).toContain("ai_run");
    expect(getPageTypes("ai_run")).toContain("query_log");
  });
});

describe("pageTypeBelongsTo", () => {
  it("returns true for matching type", () => {
    expect(pageTypeBelongsTo("case", "brain_page")).toBe(true);
    expect(pageTypeBelongsTo("time_entry", "relational_table")).toBe(true);
    expect(pageTypeBelongsTo("audit_log", "event_audit")).toBe(true);
  });

  it("returns false for non-matching type", () => {
    expect(pageTypeBelongsTo("case", "ai_run")).toBe(false);
    expect(pageTypeBelongsTo("document", "brain_page")).toBe(false);
  });
});

// ── getClassificationSummary ──────────────────────────────────────────

describe("getClassificationSummary", () => {
  it("returns summary with 5 total classes", () => {
    const summary = getClassificationSummary();
    expect(summary.total_classes).toBe(5);
    expect(summary.classes).toHaveLength(5);
  });

  it("counts sensitivities correctly", () => {
    const summary = getClassificationSummary();
    expect(summary.by_sensitivity.public).toBe(0);
    expect(summary.by_sensitivity.internal).toBe(1);
    expect(summary.by_sensitivity.confidential).toBe(3);
    expect(summary.by_sensitivity.restricted).toBe(1);
  });

  it("counts GoBD-relevant classes", () => {
    const summary = getClassificationSummary();
    expect(summary.gobd_relevant_count).toBe(3);
  });

  it("counts GDPR-relevant classes", () => {
    const summary = getClassificationSummary();
    expect(summary.gdpr_relevant_count).toBe(4);
  });

  it("counts immutable classes", () => {
    const summary = getClassificationSummary();
    expect(summary.immutable_count).toBe(1);
  });
});
