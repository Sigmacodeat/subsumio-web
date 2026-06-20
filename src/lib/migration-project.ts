/**
 * Migration Project Model — P1-MIGRATE-001
 * ==========================================
 * Migration Project Modell mit Mapping, Dry Run,
 * Validierung, Delta-Import und Cutover-Report.
 */

export type MigrationStatus =
  | "planning"      // In Planung
  | "mapping"       // Feld-Mapping wird definiert
  | "dry_run"       // Dry Run läuft
  | "validated"     // Validiert, bereit für Cutover
  | "importing"     // Import läuft
  | "delta_import"  // Delta-Import läuft
  | "completed"     // Abgeschlossen
  | "failed"        // Fehlgeschlagen
  | "cancelled";    // Abgebrochen

export type SourceSystem = "datev" | "beA" | "excel" | "word" | "pdf" | "csv" | "other_dms" | "custom";
export type MappingStatus = "auto_mapped" | "manual_mapped" | "unmapped" | "ignored";

export interface FieldMapping {
  source_field: string;
  target_field: string;
  status: MappingStatus;
  transform?: string;
  default_value?: unknown;
  required: boolean;
  notes?: string;
}

export interface MigrationStats {
  total_records: number;
  processed_records: number;
  successful_records: number;
  failed_records: number;
  skipped_records: number;
  error_rate: number;
  success_rate: number;
}

export interface DryRunResult {
  run_at: string;
  stats: MigrationStats;
  errors: MigrationError[];
  warnings: string[];
  sample_records: unknown[];
}

export interface MigrationError {
  record_index: number;
  field: string;
  error: string;
  source_value?: string;
}

export interface CutoverReport {
  generated_at: string;
  pre_import_stats: MigrationStats;
  post_import_stats: MigrationStats;
  delta_stats: MigrationStats;
  duration_seconds: number;
  rollback_available: boolean;
  summary: string;
}

export interface MigrationProject {
  id: string;
  name: string;
  description: string;
  brain_id: string;
  org_id: string;
  source_system: SourceSystem;
  source_path: string;
  status: MigrationStatus;
  field_mappings: FieldMapping[];
  dry_run_result?: DryRunResult;
  cutover_report?: CutoverReport;
  /** Scheduling */
  planned_cutover_date?: string;
  actual_cutover_date?: string;
  /** Delta */
  last_delta_import_at?: string;
  delta_count: number;
  /** Audit */
  created_by: string;
  created_at: string;
  updated_at: string;
  audit_entries: MigrationAuditEntry[];
}

export interface MigrationAuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
  previous_status?: MigrationStatus;
  new_status?: MigrationStatus;
}

// ── Factory ───────────────────────────────────────────────────────────

export function createMigrationProject(params: {
  name: string;
  description?: string;
  brain_id: string;
  org_id: string;
  source_system: SourceSystem;
  source_path: string;
  created_by: string;
}): MigrationProject {
  const now = new Date().toISOString();
  return {
    id: `mig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: params.name,
    description: params.description ?? "",
    brain_id: params.brain_id,
    org_id: params.org_id,
    source_system: params.source_system,
    source_path: params.source_path,
    status: "planning",
    field_mappings: [],
    delta_count: 0,
    created_by: params.created_by,
    created_at: now,
    updated_at: now,
    audit_entries: [
      { timestamp: now, actor: params.created_by, action: "created" },
    ],
  };
}

// ── State Transitions ─────────────────────────────────────────────────

export function addMigrationAudit(
  project: MigrationProject,
  actor: string,
  action: string,
  details?: string,
  previousStatus?: MigrationStatus,
  newStatus?: MigrationStatus,
): MigrationProject {
  return {
    ...project,
    updated_at: new Date().toISOString(),
    audit_entries: [
      ...project.audit_entries,
      { timestamp: new Date().toISOString(), actor, action, details, previous_status: previousStatus, new_status: newStatus },
    ],
  };
}

export function startMapping(project: MigrationProject, actor: string): MigrationProject {
  const updated = addMigrationAudit(project, actor, "start_mapping", undefined, project.status, "mapping");
  return { ...updated, status: "mapping" };
}

export function setFieldMappings(project: MigrationProject, mappings: FieldMapping[], actor: string): MigrationProject {
  const updated = addMigrationAudit(project, actor, "set_mappings", `${mappings.length} mappings defined`);
  return { ...updated, field_mappings: mappings };
}

export function runDryRun(project: MigrationProject, result: DryRunResult, actor: string): MigrationProject {
  const updated = addMigrationAudit(project, actor, "dry_run", `success rate: ${result.stats.success_rate}%`, project.status, "dry_run");
  return { ...updated, status: "dry_run", dry_run_result: result };
}

export function validateMigration(project: MigrationProject, actor: string): MigrationProject {
  const updated = addMigrationAudit(project, actor, "validate", undefined, project.status, "validated");
  return { ...updated, status: "validated" };
}

export function startImport(project: MigrationProject, actor: string): MigrationProject {
  const updated = addMigrationAudit(project, actor, "start_import", undefined, project.status, "importing");
  return { ...updated, status: "importing", actual_cutover_date: new Date().toISOString() };
}

export function runDeltaImport(project: MigrationProject, stats: MigrationStats, actor: string): MigrationProject {
  const now = new Date().toISOString();
  const updated = addMigrationAudit(project, actor, "delta_import", `${stats.processed_records} records`, project.status, "delta_import");
  return {
    ...updated,
    status: "delta_import",
    last_delta_import_at: now,
    delta_count: project.delta_count + 1,
  };
}

export function completeMigration(project: MigrationProject, report: CutoverReport, actor: string): MigrationProject {
  const updated = addMigrationAudit(project, actor, "complete", report.summary, project.status, "completed");
  return { ...updated, status: "completed", cutover_report: report };
}

export function failMigration(project: MigrationProject, reason: string, actor: string): MigrationProject {
  const updated = addMigrationAudit(project, actor, "fail", reason, project.status, "failed");
  return { ...updated, status: "failed" };
}

// ── Validation ────────────────────────────────────────────────────────

export interface MigrationValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateMigrationProject(project: MigrationProject): MigrationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!project.name) errors.push("Name is required");
  if (!project.source_path) errors.push("Source path is required");
  if (!project.brain_id) errors.push("brain_id is required");

  if (project.field_mappings.length === 0 && project.status !== "planning") {
    errors.push("Field mappings required before dry run");
  }

  const unmapped = project.field_mappings.filter((m) => m.status === "unmapped" && m.required);
  if (unmapped.length > 0 && project.status === "validated") {
    errors.push(`${unmapped.length} required fields are unmapped`);
  }

  if (project.dry_run_result && project.dry_run_result.stats.error_rate > 10) {
    warnings.push(`Dry run error rate is ${project.dry_run_result.stats.error_rate}% — consider fixing before import`);
  }

  if (project.status === "completed" && !project.cutover_report) {
    errors.push("Completed migration must have a cutover report");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Helpers ───────────────────────────────────────────────────────────

export function getUnmappedRequiredFields(project: MigrationProject): FieldMapping[] {
  return project.field_mappings.filter((m) => m.status === "unmapped" && m.required);
}

export function getAutoMappedFields(project: MigrationProject): FieldMapping[] {
  return project.field_mappings.filter((m) => m.status === "auto_mapped");
}

export function isTerminalStatus(status: MigrationStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export const MIGRATION_STATUS_LABELS: Record<MigrationStatus, string> = {
  planning: "In Planung",
  mapping: "Feld-Mapping",
  dry_run: "Dry Run",
  validated: "Validiert",
  importing: "Import läuft",
  delta_import: "Delta-Import",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};

export const SOURCE_SYSTEM_LABELS: Record<SourceSystem, string> = {
  datev: "DATEV",
  beA: "beA",
  excel: "Excel",
  word: "Word",
  pdf: "PDF",
  csv: "CSV",
  other_dms: "Anderes DMS",
  custom: "Custom",
};
