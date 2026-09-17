/**
 * Operational checks that do not need the database: free disk space and the
 * age of the last backup. The box filling up took the engine down for weeks,
 * so this is checked on every health run and alerted on.
 */

import { statfs } from "node:fs/promises";

export interface CheckResult {
  ok: boolean;
  detail?: string;
}

/** Below this share of free space the check fails and the alert goes out. */
export const DISK_WARN_FREE_RATIO = 0.1;
/** A backup older than this many hours counts as missing. */
export const BACKUP_MAX_AGE_HOURS = 36;

export function describeDisk(freeBytes: number, totalBytes: number): CheckResult {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return { ok: false, detail: "Dateisystem nicht lesbar" };
  }
  const ratio = freeBytes / totalBytes;
  const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
  const detail = `${gb(freeBytes)} frei von ${gb(totalBytes)} (${Math.round(ratio * 100)} %)`;
  return { ok: ratio >= DISK_WARN_FREE_RATIO, detail };
}

/** Free space of the filesystem the app runs on. */
export async function checkDisk(path = "/"): Promise<CheckResult> {
  try {
    const fs = await statfs(path);
    return describeDisk(fs.bavail * fs.bsize, fs.blocks * fs.bsize);
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "statfs failed" };
  }
}

export function describeBackupAge(
  lastRun: Date | null,
  now: Date,
  configured: boolean
): CheckResult {
  if (!configured) {
    return { ok: false, detail: "kein Backup eingerichtet (BACKUP_STATUS_FILE fehlt)" };
  }
  if (!lastRun) return { ok: false, detail: "noch kein Backup gelaufen" };
  const hours = (now.getTime() - lastRun.getTime()) / 3_600_000;
  const detail = `letztes Backup vor ${hours < 1 ? "<1" : Math.round(hours)} h (${lastRun
    .toISOString()
    .slice(0, 16)
    .replace("T", " ")} UTC)`;
  return { ok: hours <= BACKUP_MAX_AGE_HOURS, detail };
}

/**
 * The backup writes an ISO timestamp to BACKUP_STATUS_FILE after a successful
 * run; this reads it. Without the variable the check reports "not set up".
 */
export async function checkBackup(now = new Date()): Promise<CheckResult> {
  const file = process.env.BACKUP_STATUS_FILE;
  if (!file) return describeBackupAge(null, now, false);
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = (await readFile(file, "utf8")).trim();
    const parsed = new Date(raw);
    return describeBackupAge(Number.isNaN(parsed.getTime()) ? null : parsed, now, true);
  } catch {
    return describeBackupAge(null, now, true);
  }
}
