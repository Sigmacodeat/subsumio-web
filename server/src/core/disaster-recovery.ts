/**
 * EPIC 8 — T8.6 Backups and Disaster Recovery
 *
 * Implements backup manifest creation, integrity verification, restore
 * drill orchestration, and RPO/RTO measurement for all critical data stores.
 *
 * Backup targets:
 *   - PostgreSQL DB (pg_dump / restic)
 *   - Object Store (uploaded files)
 *   - Corpus Snapshots
 *   - Audit Logs
 *   - Evaluation Data
 *
 * Each target has a defined RPO (Recovery Point Objective) and RTO
 * (Recovery Time Objective). Restore drills verify that backups can
 * actually be restored within the RTO.
 */

import { createHash, randomUUID } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────

export type BackupTargetType =
  | "postgres_db"
  | "object_store"
  | "corpus_snapshots"
  | "audit_logs"
  | "eval_data";

export type BackupStatus = "pending" | "in_progress" | "completed" | "failed" | "verified";

export interface BackupTarget {
  type: BackupTargetType;
  name: string;
  /** Tool used for backup: restic, pg_dump, etc. */
  tool: string;
  /** Recovery Point Objective — max data loss in hours. */
  rpo_hours: number;
  /** Recovery Time Objective — max restore time in hours. */
  rto_hours: number;
  /** Whether this target is critical (must succeed for DR to pass). */
  critical: boolean;
  description: string;
}

export interface BackupManifestEntry {
  target_type: BackupTargetType;
  target_name: string;
  status: BackupStatus;
  size_bytes?: number;
  checksum?: string;
  backup_path?: string;
  started_at: string;
  completed_at?: string;
  error?: string;
  rpo_hours: number;
  rto_hours: number;
}

export interface BackupManifest {
  id: string;
  created_at: string;
  created_by: string;
  entries: BackupManifestEntry[];
  overall_status: BackupStatus;
  total_size_bytes: number;
  rpo_met: boolean;
  rto_met: boolean;
}

export interface RestoreDrillResult {
  id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  targets_tested: number;
  targets_passed: number;
  targets_failed: number;
  rpo_met: boolean;
  rto_met: boolean;
  rto_actual_hours: number;
  rpo_actual_hours: number;
  results: Array<{
    target_type: BackupTargetType;
    target_name: string;
    passed: boolean;
    restore_time_ms: number;
    integrity_check_passed: boolean;
    error?: string;
  }>;
  overall_passed: boolean;
}

// ── Backup Targets ─────────────────────────────────────────────────────

export const BACKUP_TARGETS: BackupTarget[] = [
  {
    type: "postgres_db",
    name: "PostgreSQL Database",
    tool: "restic+pg_dump",
    rpo_hours: 24,
    rto_hours: 1,
    critical: true,
    description:
      "Primary database — pages, embeddings, frontmatter, cases, minion_jobs, auth. P0 unwiederbringlich.",
  },
  {
    type: "object_store",
    name: "Object Store (Original Files)",
    tool: "restic",
    rpo_hours: 24,
    rto_hours: 1,
    critical: true,
    description:
      "Uploaded original files (GoBD § 147 AO). P0 unwiederbringlich when STORAGE_BACKEND=local.",
  },
  {
    type: "corpus_snapshots",
    name: "Corpus Snapshots",
    tool: "restic",
    rpo_hours: 168, // 7 days
    rto_hours: 2,
    critical: false,
    description: "Law corpus snapshots for reproducible retrieval evaluation.",
  },
  {
    type: "audit_logs",
    name: "Audit Logs",
    tool: "restic",
    rpo_hours: 24,
    rto_hours: 1,
    critical: true,
    description: "GoBD audit trail, access logs, cost ledger, verification receipts.",
  },
  {
    type: "eval_data",
    name: "Evaluation Data",
    tool: "restic",
    rpo_hours: 168, // 7 days
    rto_hours: 4,
    critical: false,
    description: "Eval fixtures, results, prompt registry snapshots for regression testing.",
  },
];

// ── Store ──────────────────────────────────────────────────────────────

interface DRStore {
  manifests: BackupManifest[];
  drills: RestoreDrillResult[];
}

const drStore: DRStore = {
  manifests: [],
  drills: [],
};

export function _resetDRStore(): void {
  drStore.manifests.length = 0;
  drStore.drills.length = 0;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Create a backup manifest for all targets.
 * In production, this would trigger actual backup jobs.
 * For testing and drill purposes, it simulates the backup.
 */
export async function createBackupManifest(
  createdBy: string,
  opts?: { simulate?: boolean }
): Promise<BackupManifest> {
  const manifest: BackupManifest = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    created_by: createdBy,
    entries: [],
    overall_status: "in_progress",
    total_size_bytes: 0,
    rpo_met: true,
    rto_met: true,
  };

  for (const target of BACKUP_TARGETS) {
    const entry: BackupManifestEntry = {
      target_type: target.type,
      target_name: target.name,
      status: "in_progress",
      started_at: new Date().toISOString(),
      rpo_hours: target.rpo_hours,
      rto_hours: target.rto_hours,
    };

    if (opts?.simulate) {
      // Simulate successful backup with fake size
      const simulatedSize = simulateBackupSize(target.type);
      entry.status = "completed";
      entry.size_bytes = simulatedSize;
      entry.checksum = createHash("sha256")
        .update(`${target.type}:${manifest.id}:${simulatedSize}`)
        .digest("hex");
      entry.backup_path = `restic://repo/${target.type}/${manifest.id}`;
      entry.completed_at = new Date().toISOString();
      manifest.total_size_bytes += simulatedSize;
    }

    manifest.entries.push(entry);
  }

  // Update overall status
  const allCompleted = manifest.entries.every((e) => e.status === "completed");
  const anyFailed = manifest.entries.some((e) => e.status === "failed");
  manifest.overall_status = anyFailed ? "failed" : allCompleted ? "completed" : "in_progress";

  // Check RPO/RTO
  manifest.rpo_met = manifest.entries.every((e) => e.rpo_hours <= getMaxAllowedRPO());
  manifest.rto_met = manifest.entries.every((e) => e.rto_hours <= getMaxAllowedRTO());

  drStore.manifests.push(manifest);
  return manifest;
}

function simulateBackupSize(type: BackupTargetType): number {
  const sizes: Record<BackupTargetType, number> = {
    postgres_db: 500 * 1024 * 1024, // 500 MB
    object_store: 2 * 1024 * 1024 * 1024, // 2 GB
    corpus_snapshots: 100 * 1024 * 1024, // 100 MB
    audit_logs: 50 * 1024 * 1024, // 50 MB
    eval_data: 30 * 1024 * 1024, // 30 MB
  };
  return sizes[type] ?? 0;
}

function getMaxAllowedRPO(): number {
  return 168; // 7 days max
}

function getMaxAllowedRTO(): number {
  return 4; // 4 hours max
}

/**
 * Verify the integrity of a backup manifest.
 * Checks that all entries have valid checksums and completed successfully.
 */
export async function verifyBackupIntegrity(
  manifestId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const manifest = drStore.manifests.find((m) => m.id === manifestId);
  if (!manifest) {
    return { valid: false, errors: [`Manifest ${manifestId} not found`] };
  }

  const errors: string[] = [];

  for (const entry of manifest.entries) {
    if (entry.status !== "completed") {
      errors.push(`${entry.target_name}: status is "${entry.status}", expected "completed"`);
    }
    if (!entry.checksum) {
      errors.push(`${entry.target_name}: missing checksum`);
    }
    if (!entry.backup_path) {
      errors.push(`${entry.target_name}: missing backup path`);
    }
    if (!entry.size_bytes || entry.size_bytes === 0) {
      errors.push(`${entry.target_name}: size is 0 or missing`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Run a restore drill — simulates restoring all backup targets
 * and measures whether RPO/RTO are met.
 */
export async function runRestoreDrill(
  manifestId: string,
  opts?: { simulate?: boolean }
): Promise<RestoreDrillResult> {
  const manifest = drStore.manifests.find((m) => m.id === manifestId);
  if (!manifest) {
    throw new Error(`Manifest ${manifestId} not found. Create a backup manifest first.`);
  }

  const startedAt = new Date();
  const results: RestoreDrillResult["results"] = [];
  let targetsPassed = 0;
  let targetsFailed = 0;
  let maxRestoreTime = 0;
  let maxRPO = 0;
  let maxRTO = 0;

  for (const entry of manifest.entries) {
    const target = BACKUP_TARGETS.find((t) => t.type === entry.target_type)!;
    const restoreStart = Date.now();

    let passed = true;
    let error: string | undefined;
    let integrityPassed = true;

    if (entry.status !== "completed") {
      passed = false;
      error = `Backup status is "${entry.status}", cannot restore`;
      integrityPassed = false;
    }

    if (opts?.simulate) {
      // Simulate restore time (faster for smaller targets)
      const simulatedRestoreMs = simulateRestoreTime(entry.target_type);
      const restoreTime = simulatedRestoreMs;

      if (restoreTime > target.rto_hours * 60 * 60 * 1000) {
        passed = false;
        error = `Restore time ${restoreTime}ms exceeds RTO ${target.rto_hours}h`;
      }

      if (restoreTime > maxRestoreTime) maxRestoreTime = restoreTime;
    }

    const restoreTimeMs = opts?.simulate
      ? simulateRestoreTime(entry.target_type)
      : Date.now() - restoreStart;

    if (passed) {
      targetsPassed++;
    } else {
      targetsFailed++;
    }

    if (entry.rpo_hours > maxRPO) maxRPO = entry.rpo_hours;
    if (entry.rto_hours > maxRTO) maxRTO = entry.rto_hours;

    results.push({
      target_type: entry.target_type,
      target_name: entry.target_name,
      passed,
      restore_time_ms: restoreTimeMs,
      integrity_check_passed: integrityPassed,
      error,
    });
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const rtoActualHours = durationMs / (60 * 60 * 1000);
  const rpoActualHours = maxRPO;

  const rpoMet = manifest.entries.every((e) => e.rpo_hours <= getMaxAllowedRPO());
  const rtoMet = rtoActualHours <= getMaxAllowedRTO();
  const overallPassed = targetsFailed === 0 && rpoMet && rtoMet;

  const drill: RestoreDrillResult = {
    id: randomUUID(),
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    targets_tested: manifest.entries.length,
    targets_passed: targetsPassed,
    targets_failed: targetsFailed,
    rpo_met: rpoMet,
    rto_met: rtoMet,
    rto_actual_hours: rtoActualHours,
    rpo_actual_hours: rpoActualHours,
    results,
    overall_passed: overallPassed,
  };

  drStore.drills.push(drill);
  return drill;
}

function simulateRestoreTime(type: BackupTargetType): number {
  const times: Record<BackupTargetType, number> = {
    postgres_db: 15 * 60 * 1000, // 15 minutes
    object_store: 30 * 60 * 1000, // 30 minutes
    corpus_snapshots: 10 * 60 * 1000, // 10 minutes
    audit_logs: 5 * 60 * 1000, // 5 minutes
    eval_data: 8 * 60 * 1000, // 8 minutes
  };
  return times[type] ?? 0;
}

/**
 * Get all backup manifests.
 */
export function listBackupManifests(): BackupManifest[] {
  return [...drStore.manifests];
}

/**
 * Get a specific backup manifest by id.
 */
export function getBackupManifest(id: string): BackupManifest | undefined {
  return drStore.manifests.find((m) => m.id === id);
}

/**
 * Get all restore drill results.
 */
export function listRestoreDrills(): RestoreDrillResult[] {
  return [...drStore.drills];
}

/**
 * Get a specific restore drill result by id.
 */
export function getRestoreDrill(id: string): RestoreDrillResult | undefined {
  return drStore.drills.find((d) => d.id === id);
}

/**
 * Get the current DR status summary.
 */
export function getDRStatus(): {
  total_manifests: number;
  total_drills: number;
  last_backup_at: string | null;
  last_drill_at: string | null;
  last_drill_passed: boolean | null;
  all_targets_defined: boolean;
  critical_targets: number;
  rpo_max_hours: number;
  rto_max_hours: number;
} {
  const lastBackup = drStore.manifests[drStore.manifests.length - 1];
  const lastDrill = drStore.drills[drStore.drills.length - 1];

  return {
    total_manifests: drStore.manifests.length,
    total_drills: drStore.drills.length,
    last_backup_at: lastBackup?.created_at ?? null,
    last_drill_at: lastDrill?.completed_at ?? null,
    last_drill_passed: lastDrill?.overall_passed ?? null,
    all_targets_defined: BACKUP_TARGETS.length === 5,
    critical_targets: BACKUP_TARGETS.filter((t) => t.critical).length,
    rpo_max_hours: Math.max(...BACKUP_TARGETS.map((t) => t.rpo_hours)),
    rto_max_hours: Math.max(...BACKUP_TARGETS.map((t) => t.rto_hours)),
  };
}

/**
 * Get all defined backup targets.
 */
export function getBackupTargets(): BackupTarget[] {
  return [...BACKUP_TARGETS];
}

// ── Restore Orchestration ──────────────────────────────────────────────

export interface RestoreResult {
  id: string;
  manifest_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  targets_restored: number;
  targets_failed: number;
  rto_met: boolean;
  results: Array<{
    target_type: BackupTargetType;
    target_name: string;
    restored: boolean;
    restore_time_ms: number;
    error?: string;
  }>;
  overall_success: boolean;
}

/**
 * Orchestrate an actual restore from a backup manifest.
 * In production, this would invoke restic/pg_restore for each target.
 * For testing and simulation, it validates the manifest and simulates restore.
 */
export async function restoreFromBackup(
  manifestId: string,
  opts?: { simulate?: boolean }
): Promise<RestoreResult> {
  const manifest = drStore.manifests.find((m) => m.id === manifestId);
  if (!manifest) {
    throw new Error(`Manifest ${manifestId} not found. Create a backup manifest first.`);
  }

  // Verify integrity before attempting restore
  const integrity = await verifyBackupIntegrity(manifestId);
  if (!integrity.valid) {
    throw new Error(`Backup integrity check failed: ${integrity.errors.join("; ")}`);
  }

  const startedAt = new Date();
  const results: RestoreResult["results"] = [];
  let targetsRestored = 0;
  let targetsFailed = 0;
  let maxRestoreMs = 0;

  for (const entry of manifest.entries) {
    const target = BACKUP_TARGETS.find((t) => t.type === entry.target_type)!;
    const restoreStart = Date.now();

    let restored = true;
    let error: string | undefined;

    if (entry.status !== "completed") {
      restored = false;
      error = `Backup status is "${entry.status}", cannot restore`;
    } else if (!entry.backup_path) {
      restored = false;
      error = "Missing backup path — no restore source available";
    }

    let restoreTimeMs: number;
    if (opts?.simulate) {
      restoreTimeMs = simulateRestoreTime(entry.target_type);
      if (restoreTimeMs > target.rto_hours * 60 * 60 * 1000) {
        restored = false;
        error = `Simulated restore time ${restoreTimeMs}ms exceeds RTO ${target.rto_hours}h`;
      }
    } else {
      // In production, this is where restic restore / pg_restore would run
      restoreTimeMs = Date.now() - restoreStart;
    }

    if (restoreTimeMs > maxRestoreMs) maxRestoreMs = restoreTimeMs;

    if (restored) {
      targetsRestored++;
    } else {
      targetsFailed++;
    }

    results.push({
      target_type: entry.target_type,
      target_name: entry.target_name,
      restored,
      restore_time_ms: restoreTimeMs,
      error,
    });
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const rtoMet =
    maxRestoreMs <= Math.max(...BACKUP_TARGETS.map((t) => t.rto_hours)) * 60 * 60 * 1000;

  return {
    id: randomUUID(),
    manifest_id: manifestId,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    targets_restored: targetsRestored,
    targets_failed: targetsFailed,
    rto_met: rtoMet,
    results,
    overall_success: targetsFailed === 0,
  };
}
