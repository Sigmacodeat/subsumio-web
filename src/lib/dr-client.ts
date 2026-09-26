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

export interface DRStatus {
  /** Status files are wired up (BACKUP_STATUS_FILE is set). */
  configured: boolean;
  last_backup_at: string | null;
  /** Recent, offsite and with original files — same rule as /api/cron/health. */
  backup_ok: boolean;
  backup_detail: string | null;
  backup_offsite: boolean | null;
  backup_files: string | null;
  /** Weekly restore verification (backup/verify.sh). */
  last_drill_at: string | null;
  last_drill_passed: boolean | null;
  last_drill_pages: number | null;
  critical_targets: number;
  rpo_max_hours: number;
  rto_max_hours: number;
}

interface VerifyStatus {
  at: string | null;
  passed: boolean | null;
  pages: number | null;
}

export function parseVerifyStatus(raw: string): VerifyStatus {
  try {
    const obj = JSON.parse(raw.trim()) as { at?: unknown; passed?: unknown; pages?: unknown };
    const at = typeof obj.at === "string" && !Number.isNaN(Date.parse(obj.at)) ? obj.at : null;
    return {
      at,
      passed: typeof obj.passed === "boolean" ? obj.passed : null,
      pages: typeof obj.pages === "number" ? obj.pages : null,
    };
  } catch {
    return { at: null, passed: null, pages: null };
  }
}

/**
 * The real disaster-recovery picture, read from the files the backup
 * container writes (never hard-coded): the last backup run from
 * BACKUP_STATUS_FILE, the last restore verification from `last-verify`
 * next to it.
 */
export async function readDRStatus(now = new Date()): Promise<DRStatus> {
  const { readFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const { checkBackup, parseBackupStatus } = await import("@/lib/ops-health");
  const file = process.env.BACKUP_STATUS_FILE;
  const base = {
    critical_targets: BACKUP_TARGETS.filter((t) => t.critical).length,
    rpo_max_hours: Math.max(...BACKUP_TARGETS.map((t) => t.rpo_hours)),
    rto_max_hours: Math.max(...BACKUP_TARGETS.map((t) => t.rto_hours)),
  };
  const check = await checkBackup(now);
  const backup = file
    ? await readFile(file, "utf8")
        .then(parseBackupStatus)
        .catch(() => null)
    : null;
  const verify = file
    ? await readFile(join(dirname(file), "last-verify"), "utf8")
        .then(parseVerifyStatus)
        .catch(() => null)
    : null;
  return {
    configured: Boolean(file),
    last_backup_at: backup?.at ? backup.at.toISOString() : null,
    backup_ok: check.ok,
    backup_detail: check.detail ?? null,
    backup_offsite: backup?.offsite ?? null,
    backup_files: backup?.files ?? null,
    last_drill_at: verify?.at ?? null,
    last_drill_passed: verify?.passed ?? null,
    last_drill_pages: verify?.pages ?? null,
    ...base,
  };
}
