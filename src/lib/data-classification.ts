/**
 * Datenklassifikationsvertrag — Definiert Sensitivity-Levels,
 * Retention-Policies und Tenant-Isolation-Regeln für alle
 * Daten-Entity-Klassen im System.
 *
 * 5 Entity-Klassen:
 *   1. BrainPage       — Semi-strukturierte Inhalte (Akten, Kontakte, Notizen)
 *   2. RelationalTable — Strukturierte Tabellendaten (Zeiterfassung, Fristen)
 *   3. FileObject      — Binäre Uploads (Dokumente, Beweismittel, Belege)
 *   4. EventAudit      — Audit-Log-Einträge (immutable)
 *   5. AIRun           — Transiente AI-Verarbeitungs-Datensätze
 *
 * Architektur: Thin Client — Types und Helpers hier, Durchsetzung
 * erfolgt in API-Routes und Engine-Interceptors.
 */

// ── Sensitivity Levels ────────────────────────────────────────────────

export type DataSensitivity = "public" | "internal" | "confidential" | "restricted";

export const SENSITIVITY_LABELS: Record<DataSensitivity, string> = {
  public: "Öffentlich",
  internal: "Intern",
  confidential: "Vertraulich",
  restricted: "Streng vertraulich",
};

export const SENSITIVITY_RANK: Record<DataSensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

// ── Entity Classes ────────────────────────────────────────────────────

export type EntityClass =
  | "brain_page"
  | "relational_table"
  | "file_object"
  | "event_audit"
  | "ai_run";

export const ENTITY_CLASS_LABELS: Record<EntityClass, string> = {
  brain_page: "Brain Page",
  relational_table: "Relationale Tabelle",
  file_object: "Dateiobjekt",
  event_audit: "Event/Audit",
  ai_run: "AI-Run (transient)",
};

// ── Retention ─────────────────────────────────────────────────────────

export type RetentionAction = "keep" | "archive" | "delete" | "anonymize";

export interface RetentionPolicy {
  /** ISO-8601 duration or "indefinite" */
  retention: string;
  /** Action after retention period expires */
  action: RetentionAction;
  /** Legal basis for retention (e.g. "§ 147 AO", "Art. 17 DSGVO") */
  legal_basis: string;
}

export const RETENTION_ACTION_LABELS: Record<RetentionAction, string> = {
  keep: "Aufbewahren",
  archive: "Archivieren",
  delete: "Löschen",
  anonymize: "Anonymisieren",
};

// ── Tenant Scope ──────────────────────────────────────────────────────

export interface TenantScope {
  /** Brain ID that owns this data */
  brain_id: string;
  /** Org ID for multi-tenant isolation */
  org_id: string;
  /** Source repo within brain (for cross-source isolation) */
  source?: string;
  /** If true, data is shared across brains in the same org */
  cross_brain?: boolean;
}

// ── PII Field Mapping ─────────────────────────────────────────────────

export interface PiiFieldSpec {
  /** Field name in the entity */
  field: string;
  /** Type of PII */
  pii_type: "name" | "email" | "phone" | "address" | "iban" | "tax_id" | "birthdate" | "custom";
  /** Whether this field is encrypted at rest */
  encrypted: boolean;
  /** Whether this field is masked in logs */
  masked_in_logs: boolean;
}

// ── Data Entity Classification ────────────────────────────────────────

export interface DataEntityClassification {
  entity_class: EntityClass;
  sensitivity: DataSensitivity;
  retention: RetentionPolicy;
  tenant_isolation: boolean;
  pii_fields: PiiFieldSpec[];
  /** Page types that belong to this classification (for BrainPage entities) */
  page_types?: string[];
  /** Whether the entity is immutable after creation */
  immutable: boolean;
  /** Whether the entity is subject to GoBD requirements */
  gobd_relevant: boolean;
  /** Whether the entity is subject to DSGVO/GDPR right-to-erasure */
  gdpr_relevant: boolean;
}

// ── Classification Registry ───────────────────────────────────────────

export const DATA_CLASSIFICATIONS: Record<EntityClass, DataEntityClassification> = {
  // 1. Brain Page — Semi-structured content
  brain_page: {
    entity_class: "brain_page",
    sensitivity: "confidential",
    retention: {
      retention: "indefinite",
      action: "keep",
      legal_basis: "Mandatsbezogene Aufbewahrungspflicht (§ 43 BRAO / § 18 StBerG)",
    },
    tenant_isolation: true,
    pii_fields: [
      { field: "content", pii_type: "custom", encrypted: false, masked_in_logs: true },
      {
        field: "frontmatter.client_name",
        pii_type: "name",
        encrypted: false,
        masked_in_logs: true,
      },
      {
        field: "frontmatter.client_email",
        pii_type: "email",
        encrypted: false,
        masked_in_logs: true,
      },
    ],
    page_types: [
      "case",
      "contact",
      "note",
      "invoice",
      "playbook",
      "clause_library",
      "clause_annotation",
      "workflow",
    ],
    immutable: false,
    gobd_relevant: false,
    gdpr_relevant: true,
  },

  // 2. Relational Table — Structured tabular data
  relational_table: {
    entity_class: "relational_table",
    sensitivity: "confidential",
    retention: {
      retention: "P10Y",
      action: "archive",
      legal_basis: "§ 147 Abs. 1 AO (10 Jahre)",
    },
    tenant_isolation: true,
    pii_fields: [
      { field: "lawyer", pii_type: "name", encrypted: false, masked_in_logs: false },
      { field: "description", pii_type: "custom", encrypted: false, masked_in_logs: true },
    ],
    page_types: ["time_entry", "expense", "deadline"],
    immutable: false,
    gobd_relevant: true,
    gdpr_relevant: true,
  },

  // 3. File Object — Binary uploads
  file_object: {
    entity_class: "file_object",
    sensitivity: "restricted",
    retention: {
      retention: "P10Y",
      action: "archive",
      legal_basis: "§ 147 Abs. 1 AO / § 43 BRAO (10 Jahre)",
    },
    tenant_isolation: true,
    pii_fields: [
      { field: "filename", pii_type: "custom", encrypted: false, masked_in_logs: false },
      { field: "content", pii_type: "custom", encrypted: true, masked_in_logs: true },
    ],
    page_types: ["document", "evidence", "receipt"],
    immutable: false,
    gobd_relevant: true,
    gdpr_relevant: true,
  },

  // 4. Event/Audit — Immutable audit log
  event_audit: {
    entity_class: "event_audit",
    sensitivity: "internal",
    retention: {
      retention: "P10Y",
      action: "keep",
      legal_basis: "GoBD Rz. 107 ff. / § 146 Abs. 4 AO",
    },
    tenant_isolation: true,
    pii_fields: [
      { field: "userEmail", pii_type: "email", encrypted: false, masked_in_logs: false },
      { field: "ip", pii_type: "custom", encrypted: false, masked_in_logs: false },
    ],
    page_types: ["audit_log"],
    immutable: true,
    gobd_relevant: true,
    gdpr_relevant: false,
  },

  // 5. AI Run — Transient AI processing
  ai_run: {
    entity_class: "ai_run",
    sensitivity: "confidential",
    retention: {
      retention: "P90D",
      action: "anonymize",
      legal_basis: "Art. 5 Abs. 1 lit. e DSGVO (Speicherbegrenzung) / AI Act Art. 12",
    },
    tenant_isolation: true,
    pii_fields: [
      { field: "prompt", pii_type: "custom", encrypted: false, masked_in_logs: true },
      { field: "response", pii_type: "custom", encrypted: false, masked_in_logs: true },
      { field: "user_email", pii_type: "email", encrypted: false, masked_in_logs: true },
    ],
    page_types: ["ai_run", "query_log"],
    immutable: false,
    gobd_relevant: false,
    gdpr_relevant: true,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────

/** Get classification for an entity class */
export function getClassification(entityClass: EntityClass): DataEntityClassification {
  return DATA_CLASSIFICATIONS[entityClass];
}

/** Infer entity class from a BrainPage type field */
export function inferEntityClass(pageType: string | undefined): EntityClass {
  if (!pageType) return "brain_page";
  const auditTypes = ["audit_log"];
  const aiRunTypes = ["ai_run", "query_log"];
  const fileTypes = ["document", "evidence", "receipt"];
  const tableTypes = ["time_entry", "expense", "deadline"];

  if (auditTypes.includes(pageType)) return "event_audit";
  if (aiRunTypes.includes(pageType)) return "ai_run";
  if (fileTypes.includes(pageType)) return "file_object";
  if (tableTypes.includes(pageType)) return "relational_table";
  return "brain_page";
}

/** Get classification for a BrainPage by its type */
export function getClassificationForPage(pageType: string | undefined): DataEntityClassification {
  return getClassification(inferEntityClass(pageType));
}

/** Check if a sensitivity level meets a minimum requirement */
export function meetsSensitivity(actual: DataSensitivity, required: DataSensitivity): boolean {
  return SENSITIVITY_RANK[actual] >= SENSITIVITY_RANK[required];
}

/** Check if an entity class is immutable */
export function isImmutable(entityClass: EntityClass): boolean {
  return DATA_CLASSIFICATIONS[entityClass].immutable;
}

/** Check if an entity class is GoBD-relevant */
export function isGobdRelevant(entityClass: EntityClass): boolean {
  return DATA_CLASSIFICATIONS[entityClass].gobd_relevant;
}

/** Check if an entity class is GDPR-relevant */
export function isGdprRelevant(entityClass: EntityClass): boolean {
  return DATA_CLASSIFICATIONS[entityClass].gdpr_relevant;
}

/** Get all PII fields for an entity class */
export function getPiiFields(entityClass: EntityClass): PiiFieldSpec[] {
  return DATA_CLASSIFICATIONS[entityClass].pii_fields;
}

/** Check if a field is a PII field for an entity class */
export function isPiiField(entityClass: EntityClass, field: string): boolean {
  return DATA_CLASSIFICATIONS[entityClass].pii_fields.some((f) => f.field === field);
}

/** Mask a PII value for logging */
export function maskPiiValue(value: string): string {
  if (value.length <= 4) return "***";
  return value.slice(0, 2) + "***" + value.slice(-2);
}

/** Get all entity classes with a given sensitivity */
export function filterBySensitivity(sensitivity: DataSensitivity): EntityClass[] {
  return (Object.keys(DATA_CLASSIFICATIONS) as EntityClass[]).filter(
    (ec) => DATA_CLASSIFICATIONS[ec].sensitivity === sensitivity
  );
}

/** Get all entity classes that are GoBD-relevant */
export function getGobdRelevantClasses(): EntityClass[] {
  return (Object.keys(DATA_CLASSIFICATIONS) as EntityClass[]).filter(
    (ec) => DATA_CLASSIFICATIONS[ec].gobd_relevant
  );
}

/** Get all entity classes that are GDPR-relevant */
export function getGdprRelevantClasses(): EntityClass[] {
  return (Object.keys(DATA_CLASSIFICATIONS) as EntityClass[]).filter(
    (ec) => DATA_CLASSIFICATIONS[ec].gdpr_relevant
  );
}

/** Validate that a tenant scope is properly set */
export function validateTenantScope(scope: TenantScope): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!scope.brain_id || scope.brain_id.trim() === "") {
    errors.push("brain_id is required");
  }
  if (!scope.org_id || scope.org_id.trim() === "") {
    errors.push("org_id is required");
  }
  return { valid: errors.length === 0, errors };
}

/** Check if two tenant scopes are compatible (same org, potentially different brain) */
export function isSameOrg(a: TenantScope, b: TenantScope): boolean {
  return a.org_id === b.org_id;
}

/** Check if two tenant scopes are strictly the same brain */
export function isSameBrain(a: TenantScope, b: TenantScope): boolean {
  return a.brain_id === b.brain_id && a.org_id === b.org_id;
}

/** Parse an ISO-8601 duration string into milliseconds */
export function parseDurationToMs(duration: string): number | null {
  if (duration === "indefinite") return null;
  const match = duration.match(
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
  );
  if (!match) return null;
  const [, years, months, weeks, days, hours, minutes, seconds] = match;
  const ms =
    parseInt(years || "0", 10) * 365.25 * 24 * 60 * 60 * 1000 +
    parseInt(months || "0", 10) * 30.44 * 24 * 60 * 60 * 1000 +
    parseInt(weeks || "0", 10) * 7 * 24 * 60 * 60 * 1000 +
    parseInt(days || "0", 10) * 24 * 60 * 60 * 1000 +
    parseInt(hours || "0", 10) * 60 * 60 * 1000 +
    parseInt(minutes || "0", 10) * 60 * 1000 +
    parseInt(seconds || "0", 10) * 1000;
  return ms;
}

/** Calculate when retention expires for a given created date */
export function calculateRetentionExpiry(createdAt: string, entityClass: EntityClass): Date | null {
  const policy = DATA_CLASSIFICATIONS[entityClass].retention;
  const ms = parseDurationToMs(policy.retention);
  if (ms === null) return null; // indefinite
  return new Date(new Date(createdAt).getTime() + ms);
}

/** Check if retention has expired for an entity */
export function isRetentionExpired(
  createdAt: string,
  entityClass: EntityClass,
  now?: Date
): boolean {
  const expiry = calculateRetentionExpiry(createdAt, entityClass);
  if (expiry === null) return false; // indefinite
  return expiry <= (now ?? new Date());
}

/** Get the retention action for an entity class */
export function getRetentionAction(entityClass: EntityClass): RetentionAction {
  return DATA_CLASSIFICATIONS[entityClass].retention.action;
}

/** Get all page types for an entity class */
export function getPageTypes(entityClass: EntityClass): string[] {
  return DATA_CLASSIFICATIONS[entityClass].page_types ?? [];
}

/** Check if a page type belongs to an entity class */
export function pageTypeBelongsTo(pageType: string, entityClass: EntityClass): boolean {
  const types = getPageTypes(entityClass);
  return types.includes(pageType);
}

// ── Summary ───────────────────────────────────────────────────────────

export interface ClassificationSummary {
  total_classes: number;
  by_sensitivity: Record<DataSensitivity, number>;
  gobd_relevant_count: number;
  gdpr_relevant_count: number;
  immutable_count: number;
  classes: EntityClass[];
}

export function getClassificationSummary(): ClassificationSummary {
  const classes = Object.keys(DATA_CLASSIFICATIONS) as EntityClass[];
  const bySensitivity: Record<DataSensitivity, number> = {
    public: 0,
    internal: 0,
    confidential: 0,
    restricted: 0,
  };
  let gobdCount = 0;
  let gdprCount = 0;
  let immutableCount = 0;

  for (const ec of classes) {
    const c = DATA_CLASSIFICATIONS[ec];
    bySensitivity[c.sensitivity]++;
    if (c.gobd_relevant) gobdCount++;
    if (c.gdpr_relevant) gdprCount++;
    if (c.immutable) immutableCount++;
  }

  return {
    total_classes: classes.length,
    by_sensitivity: bySensitivity,
    gobd_relevant_count: gobdCount,
    gdpr_relevant_count: gdprCount,
    immutable_count: immutableCount,
    classes,
  };
}
