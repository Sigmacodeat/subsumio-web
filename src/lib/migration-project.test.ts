import { describe, it, expect } from "vitest";
import {
  createMigrationProject,
  startMapping,
  setFieldMappings,
  runDryRun,
  validateMigration,
  startImport,
  completeMigration,
  failMigration,
  runDeltaImport,
  validateMigrationProject,
  getUnmappedRequiredFields,
  getAutoMappedFields,
  isTerminalStatus,
  MIGRATION_STATUS_LABELS,
  SOURCE_SYSTEM_LABELS,
  type MigrationProject,
  type FieldMapping,
  type DryRunResult,
  type CutoverReport,
} from "@/lib/migration-project";

function createTestProject(overrides: Partial<MigrationProject> = {}): MigrationProject {
  return {
    ...createMigrationProject({
      name: "Test Migration",
      brain_id: "brain-1",
      org_id: "org-1",
      source_system: "datev",
      source_path: "/data/export.csv",
      created_by: "admin@test",
    }),
    ...overrides,
  };
}

function createTestMappings(): FieldMapping[] {
  return [
    { source_field: "name", target_field: "client_name", status: "auto_mapped", required: true },
    { source_field: "email", target_field: "client_email", status: "auto_mapped", required: true },
    { source_field: "phone", target_field: "client_phone", status: "manual_mapped", required: false },
  ];
}

function createTestDryRunResult(): DryRunResult {
  return {
    run_at: new Date().toISOString(),
    stats: {
      total_records: 100,
      processed_records: 100,
      successful_records: 95,
      failed_records: 5,
      skipped_records: 0,
      error_rate: 5,
      success_rate: 95,
    },
    errors: [],
    warnings: [],
    sample_records: [],
  };
}

function createTestCutoverReport(): CutoverReport {
  return {
    generated_at: new Date().toISOString(),
    pre_import_stats: { total_records: 100, processed_records: 100, successful_records: 95, failed_records: 5, skipped_records: 0, error_rate: 5, success_rate: 95 },
    post_import_stats: { total_records: 100, processed_records: 100, successful_records: 95, failed_records: 5, skipped_records: 0, error_rate: 5, success_rate: 95 },
    delta_stats: { total_records: 5, processed_records: 5, successful_records: 5, failed_records: 0, skipped_records: 0, error_rate: 0, success_rate: 100 },
    duration_seconds: 120,
    rollback_available: true,
    summary: "Migration completed with 95% success rate",
  };
}

describe("Migration Project — Factory", () => {
  it("creates project with correct defaults", () => {
    const project = createTestProject();
    expect(project.id).toBeTruthy();
    expect(project.status).toBe("planning");
    expect(project.field_mappings).toEqual([]);
    expect(project.delta_count).toBe(0);
    expect(project.audit_entries).toHaveLength(1);
  });
});

describe("Migration Project — State Transitions", () => {
  it("startMapping changes status", () => {
    const project = createTestProject();
    const updated = startMapping(project, "admin@test");
    expect(updated.status).toBe("mapping");
  });

  it("setFieldMappings sets mappings", () => {
    const project = createTestProject();
    const updated = setFieldMappings(project, createTestMappings(), "admin@test");
    expect(updated.field_mappings).toHaveLength(3);
  });

  it("runDryRun sets result and status", () => {
    const project = createTestProject();
    const updated = runDryRun(project, createTestDryRunResult(), "admin@test");
    expect(updated.status).toBe("dry_run");
    expect(updated.dry_run_result).toBeTruthy();
  });

  it("validateMigration changes status to validated", () => {
    const project = createTestProject();
    const updated = validateMigration(project, "admin@test");
    expect(updated.status).toBe("validated");
  });

  it("startImport changes status and sets cutover date", () => {
    const project = createTestProject();
    const updated = startImport(project, "admin@test");
    expect(updated.status).toBe("importing");
    expect(updated.actual_cutover_date).toBeTruthy();
  });

  it("completeMigration sets cutover report", () => {
    const project = createTestProject();
    const updated = completeMigration(project, createTestCutoverReport(), "admin@test");
    expect(updated.status).toBe("completed");
    expect(updated.cutover_report).toBeTruthy();
  });

  it("failMigration sets status to failed", () => {
    const project = createTestProject();
    const updated = failMigration(project, "Connection error", "admin@test");
    expect(updated.status).toBe("failed");
  });

  it("runDeltaImport increments delta count", () => {
    const project = createTestProject();
    const stats = { total_records: 5, processed_records: 5, successful_records: 5, failed_records: 0, skipped_records: 0, error_rate: 0, success_rate: 100 };
    const updated = runDeltaImport(project, stats, "admin@test");
    expect(updated.delta_count).toBe(1);
    expect(updated.last_delta_import_at).toBeTruthy();
  });
});

describe("Migration Project — Validation", () => {
  it("validates a correct project", () => {
    const project = createTestProject();
    project.field_mappings = createTestMappings();
    const result = validateMigrationProject(project);
    expect(result.valid).toBe(true);
  });

  it("detects missing mappings before dry run", () => {
    const project = createTestProject({ status: "mapping" });
    const result = validateMigrationProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("mappings"))).toBe(true);
  });

  it("detects unmapped required fields at validation", () => {
    const project = createTestProject({ status: "validated" });
    project.field_mappings = [
      { source_field: "name", target_field: "client_name", status: "unmapped", required: true },
    ];
    const result = validateMigrationProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unmapped"))).toBe(true);
  });

  it("warns about high error rate in dry run", () => {
    const project = createTestProject();
    project.field_mappings = createTestMappings();
    project.dry_run_result = {
      ...createTestDryRunResult(),
      stats: { ...createTestDryRunResult().stats, error_rate: 15, success_rate: 85 },
    };
    const result = validateMigrationProject(project);
    expect(result.warnings.some((w) => w.includes("error rate"))).toBe(true);
  });

  it("detects completed without cutover report", () => {
    const project = createTestProject({ status: "completed" });
    project.field_mappings = createTestMappings();
    const result = validateMigrationProject(project);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("cutover"))).toBe(true);
  });
});

describe("Migration Project — Helpers", () => {
  it("getUnmappedRequiredFields returns unmapped required", () => {
    const project = createTestProject();
    project.field_mappings = [
      { source_field: "a", target_field: "a", status: "unmapped", required: true },
      { source_field: "b", target_field: "b", status: "auto_mapped", required: true },
      { source_field: "c", target_field: "c", status: "unmapped", required: false },
    ];
    expect(getUnmappedRequiredFields(project)).toHaveLength(1);
  });

  it("getAutoMappedFields returns auto-mapped", () => {
    const project = createTestProject();
    project.field_mappings = createTestMappings();
    expect(getAutoMappedFields(project)).toHaveLength(2);
  });

  it("isTerminalStatus identifies terminal states", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("planning")).toBe(false);
  });
});

describe("Migration Project — Labels", () => {
  it("has status labels", () => {
    expect(MIGRATION_STATUS_LABELS["planning"]).toBe("In Planung");
    expect(MIGRATION_STATUS_LABELS["completed"]).toBe("Abgeschlossen");
  });

  it("has source system labels", () => {
    expect(SOURCE_SYSTEM_LABELS["datev"]).toBe("DATEV");
    expect(SOURCE_SYSTEM_LABELS["beA"]).toBe("beA");
  });
});
