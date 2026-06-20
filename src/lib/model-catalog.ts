/**
 * Domain Model Catalog — Zentrales Verzeichnis aller Datenmodelle
 * im Subsumio-System.
 *
 * Definiert für jede Domäne:
 *   - Modell-Interface mit Feldern, Typen und Kardinalitäten
 *   - Brain Page Type Mapping (welche page types gehören zur Domäne)
 *   - Entity Class (Verweis auf Datenklassifikation)
 *   - Owner (welche Komponente ist kanonisch für CRUD)
 *   - API Route(s)
 *   - Abhängigkeiten zu anderen Domänen
 *
 * Domänen:
 *   1. Source Registry   — Rechtsquellen-Register
 *   2. Workflows          — Workflow-Templates und -Instanzen
 *   3. Review Sets        — Contract Review & Clause Annotations
 *   4. Filing Packages    — GoBD-konforme Aktenexporte
 *   5. Ethics/AML         — Compliance-Checks und Conflict of Interest
 *   6. Analytics          — KPIs, Metriken, Reporting
 *   7. Collaboration      — Kommentare, Freigaben, Assignments
 *   8. Migration          — Data Import/Export, Schema-Migrationen
 */

import type { EntityClass } from "@/lib/data-classification";

// ── Types ─────────────────────────────────────────────────────────────

export type DomainName =
  | "source_registry"
  | "workflows"
  | "review_sets"
  | "filing_packages"
  | "ethics_aml"
  | "analytics"
  | "collaboration"
  | "migration";

export type FieldCardinality = "one" | "many" | "optional";

export type FieldType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "json"
  | "ref"
  | "slug";

export interface ModelFieldSpec {
  name: string;
  type: FieldType;
  cardinality: FieldCardinality;
  required: boolean;
  description: string;
  /** For enum fields: allowed values */
  enumValues?: string[];
  /** For ref fields: target domain */
  refDomain?: DomainName;
  /** Whether this field is PII */
  pii?: boolean;
  /** Whether this field is encrypted at rest */
  encrypted?: boolean;
}

export interface DomainModelEntry {
  domain: DomainName;
  name: string;
  description: string;
  /** Brain page types that belong to this domain */
  pageTypes: string[];
  /** Entity class for data classification */
  entityClass: EntityClass;
  /** Which component owns CRUD operations */
  owner: string;
  /** API route prefix */
  apiRoute: string;
  /** Model fields */
  fields: ModelFieldSpec[];
  /** Dependencies to other domains */
  dependencies?: DomainName[];
  /** Whether this domain is GoBD-relevant */
  gobdRelevant: boolean;
  /** Whether this domain is GDPR-relevant */
  gdprRelevant: boolean;
}

// ── Domain Labels ─────────────────────────────────────────────────────

export const DOMAIN_LABELS: Record<DomainName, string> = {
  source_registry: "Rechtsquellen-Register",
  workflows: "Workflows",
  review_sets: "Contract Review",
  filing_packages: "GoBD-Aktenexport",
  ethics_aml: "Compliance & Ethics",
  analytics: "Analytics & Reporting",
  collaboration: "Zusammenarbeit",
  migration: "Migration & Import",
};

// ── Model Catalog ─────────────────────────────────────────────────────

export const DOMAIN_MODELS: Record<DomainName, DomainModelEntry> = {
  // 1. Source Registry
  source_registry: {
    domain: "source_registry",
    name: "SourceRegistryEntry",
    description: "Rechtsquellen-Register: Gesetze, Judikate, Verordnungen mit Freshness-Tracking und Sync-Status",
    pageTypes: ["legal_source", "statute", "judgement"],
    entityClass: "brain_page",
    owner: "src/lib/source-registry.ts",
    apiRoute: "/api/legal/sources",
    fields: [
      { name: "slug", type: "slug", cardinality: "one", required: true, description: "Eindeutiger Identifier" },
      { name: "title", type: "string", cardinality: "one", required: true, description: "Titel der Rechtsquelle" },
      { name: "jurisdiction", type: "enum", cardinality: "one", required: true, description: "AT, DE, CH, EU", enumValues: ["at", "de", "ch", "eu"] },
      { name: "source_type", type: "enum", cardinality: "one", required: true, description: "Quellentyp", enumValues: ["statute", "judgement", "regulation", "ordinance"] },
      { name: "citation", type: "string", cardinality: "one", required: true, description: "Zitierweise" },
      { name: "url", type: "string", cardinality: "optional", required: false, description: "Original-URL" },
      { name: "sha256", type: "string", cardinality: "optional", required: false, description: "Content-Hash für Change-Detection" },
      { name: "last_synced_at", type: "date", cardinality: "optional", required: false, description: "Letzter Sync-Zeitpunkt" },
      { name: "freshness_status", type: "enum", cardinality: "one", required: true, description: "Freshness-Indikator", enumValues: ["fresh", "stale", "outdated", "unknown"] },
    ],
    dependencies: [],
    gobdRelevant: false,
    gdprRelevant: false,
  },

  // 2. Workflows
  workflows: {
    domain: "workflows",
    name: "WorkflowInstance",
    description: "Workflow-Templates und -Instanzen mit Steps, Status und Approvals",
    pageTypes: ["workflow", "workflow_template"],
    entityClass: "brain_page",
    owner: "src/lib/workflow.ts",
    apiRoute: "/api/workflows",
    fields: [
      { name: "slug", type: "slug", cardinality: "one", required: true, description: "Workflow-Identifier" },
      { name: "title", type: "string", cardinality: "one", required: true, description: "Workflow-Titel" },
      { name: "template_id", type: "string", cardinality: "one", required: true, description: "Template-ID" },
      { name: "case_slug", type: "ref", cardinality: "one", required: true, description: "Zugehörige Akte", refDomain: "review_sets" },
      { name: "status", type: "enum", cardinality: "one", required: true, description: "Workflow-Status", enumValues: ["pending", "active", "completed", "failed", "cancelled"] },
      { name: "steps", type: "json", cardinality: "many", required: true, description: "Step-Definitionen mit Status" },
      { name: "current_step", type: "number", cardinality: "one", required: false, description: "Index des aktuellen Steps" },
      { name: "started_at", type: "date", cardinality: "one", required: false, description: "Start-Zeitpunkt" },
      { name: "completed_at", type: "date", cardinality: "optional", required: false, description: "Abschluss-Zeitpunkt" },
      { name: "error", type: "text", cardinality: "optional", required: false, description: "Fehlermeldung bei fehlgeschlagenem Step" },
    ],
    dependencies: ["review_sets", "collaboration"],
    gobdRelevant: false,
    gdprRelevant: true,
  },

  // 3. Review Sets (Contract Review & Clause Annotations)
  review_sets: {
    domain: "review_sets",
    name: "ClauseAnnotation",
    description: "Vertragsklausel-Bewertungen mit Risiko-Level, Rechtsgrundlage und Review-Status",
    pageTypes: ["clause_annotation", "contract", "playbook", "clause_library"],
    entityClass: "brain_page",
    owner: "src/lib/clause-annotation.ts",
    apiRoute: "/api/clause-annotations",
    fields: [
      { name: "slug", type: "slug", cardinality: "one", required: true, description: "Annotation-Identifier" },
      { name: "contract_slug", type: "ref", cardinality: "one", required: true, description: "Vertrags-Referenz", refDomain: "review_sets" },
      { name: "clause_type", type: "enum", cardinality: "one", required: true, description: "Klauseltyp", enumValues: ["nda", "employment", "service", "sale", "lease", "partnership", "licensing", "settlement", "liability", "payment", "termination", "ip", "data_protection", "warranty", "general"] },
      { name: "clause_title", type: "string", cardinality: "one", required: true, description: "Klausel-Titel" },
      { name: "clause_excerpt", type: "text", cardinality: "one", required: true, description: "Klausel-Auszug" },
      { name: "risk_level", type: "enum", cardinality: "one", required: true, description: "Risiko-Level", enumValues: ["low", "medium", "high", "critical"] },
      { name: "legal_basis", type: "string", cardinality: "one", required: true, description: "Rechtsgrundlage" },
      { name: "recommendation", type: "text", cardinality: "one", required: true, description: "Änderungsempfehlung" },
      { name: "review_status", type: "enum", cardinality: "one", required: true, description: "Review-Status", enumValues: ["pending", "approved", "rejected"] },
      { name: "playbook_rule_id", type: "string", cardinality: "optional", required: false, description: "Playbook-Regel-Referenz" },
      { name: "position_start", type: "number", cardinality: "optional", required: false, description: "Start-Position im Vertrag" },
      { name: "position_end", type: "number", cardinality: "optional", required: false, description: "End-Position im Vertrag" },
      { name: "annotated_by", type: "string", cardinality: "one", required: true, description: "Ersteller", pii: true },
      { name: "annotated_at", type: "date", cardinality: "one", required: true, description: "Erstellungs-Zeitpunkt" },
      { name: "reviewed_by", type: "string", cardinality: "optional", required: false, description: "Reviewer", pii: true },
      { name: "reviewed_at", type: "date", cardinality: "optional", required: false, description: "Review-Zeitpunkt" },
      { name: "reject_reason", type: "text", cardinality: "optional", required: false, description: "Ablehnungsgrund" },
    ],
    dependencies: ["collaboration"],
    gobdRelevant: false,
    gdprRelevant: true,
  },

  // 4. Filing Packages (GoBD-Aktenexport)
  filing_packages: {
    domain: "filing_packages",
    name: "FilingPackage",
    description: "GoBD-konforme Aktenexporte mit Hash-Kette und Manipulations-Evidenz",
    pageTypes: ["filing_package", "invoice", "datev_export"],
    entityClass: "file_object",
    owner: "src/lib/gobd.ts",
    apiRoute: "/api/filing-packages",
    fields: [
      { name: "slug", type: "slug", cardinality: "one", required: true, description: "Package-Identifier" },
      { name: "case_slug", type: "ref", cardinality: "one", required: true, description: "Akten-Referenz", refDomain: "review_sets" },
      { name: "title", type: "string", cardinality: "one", required: true, description: "Package-Titel" },
      { name: "items", type: "json", cardinality: "many", required: true, description: "Enthaltene Dokumente/Seiten" },
      { name: "hash_chain", type: "json", cardinality: "one", required: true, description: "GoBD-Hash-Kette" },
      { name: "created_at", type: "date", cardinality: "one", required: true, description: "Erstellungs-Zeitpunkt" },
      { name: "created_by", type: "string", cardinality: "one", required: true, description: "Ersteller", pii: true },
      { name: "status", type: "enum", cardinality: "one", required: true, description: "Package-Status", enumValues: ["draft", "sealed", "exported", "archived"] },
      { name: "export_format", type: "enum", cardinality: "one", required: false, description: "Export-Format", enumValues: ["pdf", "zip", "datev"] },
    ],
    dependencies: ["review_sets"],
    gobdRelevant: true,
    gdprRelevant: true,
  },

  // 5. Ethics/AML
  ethics_aml: {
    domain: "ethics_aml",
    name: "ComplianceCheck",
    description: "Compliance-Checks: Conflict of Interest, AML/KYC, Geldwäsche-Prävention",
    pageTypes: ["compliance_check", "conflict_check", "aml_report"],
    entityClass: "brain_page",
    owner: "src/lib/compliance.ts",
    apiRoute: "/api/compliance",
    fields: [
      { name: "slug", type: "slug", cardinality: "one", required: true, description: "Check-Identifier" },
      { name: "case_slug", type: "ref", cardinality: "one", required: true, description: "Akten-Referenz", refDomain: "review_sets" },
      { name: "check_type", type: "enum", cardinality: "one", required: true, description: "Check-Typ", enumValues: ["conflict_of_interest", "aml_kyc", "sanctions_check", "pep_check"] },
      { name: "status", type: "enum", cardinality: "one", required: true, description: "Check-Status", enumValues: ["pending", "clear", "flagged", "escalated"] },
      { name: "findings", type: "json", cardinality: "many", required: false, description: "Check-Ergebnisse" },
      { name: "risk_score", type: "number", cardinality: "one", required: false, description: "Risiko-Score (0-100)" },
      { name: "checked_by", type: "string", cardinality: "one", required: true, description: "Prüfer", pii: true },
      { name: "checked_at", type: "date", cardinality: "one", required: true, description: "Prüfungs-Zeitpunkt" },
      { name: "escalated_to", type: "string", cardinality: "optional", required: false, description: "Eskaliert an", pii: true },
    ],
    dependencies: ["review_sets"],
    gobdRelevant: true,
    gdprRelevant: true,
  },

  // 6. Analytics
  analytics: {
    domain: "analytics",
    name: "AnalyticsMetric",
    description: "KPIs, Metriken und Reporting-Daten für Dashboard und Reporting",
    pageTypes: ["analytics_metric", "report", "kpi_snapshot"],
    entityClass: "relational_table",
    owner: "src/lib/analytics.ts",
    apiRoute: "/api/analytics",
    fields: [
      { name: "slug", type: "slug", cardinality: "one", required: true, description: "Metric-Identifier" },
      { name: "metric_type", type: "enum", cardinality: "one", required: true, description: "Metrik-Typ", enumValues: ["revenue", "utilization", "case_count", "deadline_compliance", "client_satisfaction"] },
      { name: "value", type: "number", cardinality: "one", required: true, description: "Metrik-Wert" },
      { name: "unit", type: "string", cardinality: "one", required: true, description: "Einheit" },
      { name: "period", type: "string", cardinality: "one", required: true, description: "Zeitraum (z.B. 2026-06)" },
      { name: "dimensions", type: "json", cardinality: "optional", required: false, description: "Dimensionen für Gruppierung" },
      { name: "computed_at", type: "date", cardinality: "one", required: true, description: "Berechnungs-Zeitpunkt" },
    ],
    dependencies: [],
    gobdRelevant: false,
    gdprRelevant: false,
  },

  // 7. Collaboration
  collaboration: {
    domain: "collaboration",
    name: "CommentThread",
    description: "Kommentare, Freigaben und Assignments für Zusammenarbeit",
    pageTypes: ["comment", "approval", "assignment"],
    entityClass: "brain_page",
    owner: "src/lib/approval.ts",
    apiRoute: "/api/comments",
    fields: [
      { name: "slug", type: "slug", cardinality: "one", required: true, description: "Comment-Identifier" },
      { name: "parent_slug", type: "ref", cardinality: "one", required: true, description: "Parent-Element", refDomain: "review_sets" },
      { name: "parent_type", type: "enum", cardinality: "one", required: true, description: "Parent-Typ", enumValues: ["case", "document", "time_entry", "clause_annotation", "workflow"] },
      { name: "author", type: "string", cardinality: "one", required: true, description: "Autor", pii: true },
      { name: "body", type: "text", cardinality: "one", required: true, description: "Kommentar-Text" },
      { name: "created_at", type: "date", cardinality: "one", required: true, description: "Erstellungs-Zeitpunkt" },
      { name: "resolved", type: "boolean", cardinality: "one", required: false, description: "Aufgelöst?" },
      { name: "resolved_by", type: "string", cardinality: "optional", required: false, description: "Aufgelöst von", pii: true },
      { name: "resolved_at", type: "date", cardinality: "optional", required: false, description: "Auflösungs-Zeitpunkt" },
    ],
    dependencies: ["review_sets", "workflows"],
    gobdRelevant: false,
    gdprRelevant: true,
  },

  // 8. Migration
  migration: {
    domain: "migration",
    name: "MigrationJob",
    description: "Data Import/Export und Schema-Migrationen",
    pageTypes: ["migration_job", "import_batch", "export_batch"],
    entityClass: "event_audit",
    owner: "src/lib/migration.ts",
    apiRoute: "/api/migration",
    fields: [
      { name: "slug", type: "slug", cardinality: "one", required: true, description: "Job-Identifier" },
      { name: "job_type", type: "enum", cardinality: "one", required: true, description: "Job-Typ", enumValues: ["import", "export", "schema_migration", "data_conversion"] },
      { name: "source_format", type: "string", cardinality: "optional", required: false, description: "Quell-Format" },
      { name: "target_format", type: "string", cardinality: "optional", required: false, description: "Ziel-Format" },
      { name: "status", type: "enum", cardinality: "one", required: true, description: "Job-Status", enumValues: ["queued", "running", "completed", "failed", "cancelled"] },
      { name: "items_total", type: "number", cardinality: "one", required: false, description: "Gesamtanzahl Items" },
      { name: "items_processed", type: "number", cardinality: "one", required: false, description: "Verarbeitete Items" },
      { name: "items_failed", type: "number", cardinality: "one", required: false, description: "Fehlgeschlagene Items" },
      { name: "started_at", type: "date", cardinality: "one", required: true, description: "Start-Zeitpunkt" },
      { name: "completed_at", type: "date", cardinality: "optional", required: false, description: "Abschluss-Zeitpunkt" },
      { name: "initiated_by", type: "string", cardinality: "one", required: true, description: "Initiiert von", pii: true },
      { name: "error_log", type: "json", cardinality: "many", required: false, description: "Fehler-Log-Einträge" },
    ],
    dependencies: [],
    gobdRelevant: true,
    gdprRelevant: false,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────

export function getDomainModel(domain: DomainName): DomainModelEntry {
  return DOMAIN_MODELS[domain];
}

export function getAllDomains(): DomainName[] {
  return Object.keys(DOMAIN_MODELS) as DomainName[];
}

export function getDomainsByEntityClass(entityClass: EntityClass): DomainName[] {
  return (Object.keys(DOMAIN_MODELS) as DomainName[]).filter(
    (d) => DOMAIN_MODELS[d].entityClass === entityClass,
  );
}

export function getDomainForPageType(pageType: string): DomainModelEntry | null {
  for (const domain of Object.keys(DOMAIN_MODELS) as DomainName[]) {
    const entry = DOMAIN_MODELS[domain];
    if (entry.pageTypes.includes(pageType)) return entry;
  }
  return null;
}

export function getRequiredFields(domain: DomainName): ModelFieldSpec[] {
  return DOMAIN_MODELS[domain].fields.filter((f) => f.required);
}

export function getOptionalFields(domain: DomainName): ModelFieldSpec[] {
  return DOMAIN_MODELS[domain].fields.filter((f) => !f.required);
}

export function getPiiFieldsForDomain(domain: DomainName): ModelFieldSpec[] {
  return DOMAIN_MODELS[domain].fields.filter((f) => f.pii);
}

export function getDependencies(domain: DomainName): DomainName[] {
  return DOMAIN_MODELS[domain].dependencies ?? [];
}

export function getDependents(domain: DomainName): DomainName[] {
  return (Object.keys(DOMAIN_MODELS) as DomainName[]).filter(
    (d) => DOMAIN_MODELS[d].dependencies?.includes(domain),
  );
}

export function isGoBdRelevant(domain: DomainName): boolean {
  return DOMAIN_MODELS[domain].gobdRelevant;
}

export function isGdprRelevant(domain: DomainName): boolean {
  return DOMAIN_MODELS[domain].gdprRelevant;
}

// ── Summary ───────────────────────────────────────────────────────────

export interface ModelCatalogSummary {
  total_domains: number;
  total_fields: number;
  by_entity_class: Record<EntityClass, number>;
  gobd_relevant_count: number;
  gdpr_relevant_count: number;
  domains: DomainName[];
}

export function getCatalogSummary(): ModelCatalogSummary {
  const domains = Object.keys(DOMAIN_MODELS) as DomainName[];
  const byEntityClass: Record<string, number> = {};
  let totalFields = 0;
  let gobdCount = 0;
  let gdprCount = 0;

  for (const d of domains) {
    const entry = DOMAIN_MODELS[d];
    byEntityClass[entry.entityClass] = (byEntityClass[entry.entityClass] ?? 0) + 1;
    totalFields += entry.fields.length;
    if (entry.gobdRelevant) gobdCount++;
    if (entry.gdprRelevant) gdprCount++;
  }

  return {
    total_domains: domains.length,
    total_fields: totalFields,
    by_entity_class: byEntityClass as Record<EntityClass, number>,
    gobd_relevant_count: gobdCount,
    gdpr_relevant_count: gdprCount,
    domains,
  };
}
