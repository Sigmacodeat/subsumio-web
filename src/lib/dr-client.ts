/**
 * DR Client — Next.js-side copy of the disaster recovery logic.
 *
 * The server-side module (server/src/core/disaster-recovery.ts) maintains
 * an in-memory store. This client mirrors the backup target definitions
 * and DR status logic for the Next.js API route.
 */

export type BackupTargetType =
  | "postgres_db"
  | "object_store"
  | "corpus_snapshots"
  | "audit_logs"
  | "eval_data";

export interface BackupTarget {
  type: BackupTargetType;
  name: string;
  tool: string;
  rpo_hours: number;
  rto_hours: number;
  critical: boolean;
  description: string;
}

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
    rpo_hours: 168,
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
    rpo_hours: 168,
    rto_hours: 4,
    critical: false,
    description: "Eval fixtures, results, prompt registry snapshots for regression testing.",
  },
];

export function getBackupTargets(): BackupTarget[] {
  return [...BACKUP_TARGETS];
}

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
  return {
    total_manifests: 0,
    total_drills: 0,
    last_backup_at: null,
    last_drill_at: null,
    last_drill_passed: null,
    all_targets_defined: BACKUP_TARGETS.length === 5,
    critical_targets: BACKUP_TARGETS.filter((t) => t.critical).length,
    rpo_max_hours: Math.max(...BACKUP_TARGETS.map((t) => t.rpo_hours)),
    rto_max_hours: Math.max(...BACKUP_TARGETS.map((t) => t.rto_hours)),
  };
}
