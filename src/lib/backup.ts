/**
 * Backup & Restore — Server-side backup management.
 * Stores backups as JSON files in the data directory.
 */

import { promises as fs } from "fs";
import path from "path";
import { logger } from "@/lib/logger";

const log = logger("backup");

const DATA_DIR = process.env.SUBSUMIO_DATA_DIR || path.join(process.cwd(), ".data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

export interface BackupMetadata {
  id: string;
  filename: string;
  createdAt: string;
  createdBy: string;
  totalPages: number;
  totalSize: number;
  pageTypes: Record<string, number>;
  status: "completed" | "failed";
  error?: string;
}

async function ensureBackupDir(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

export async function listBackups(): Promise<BackupMetadata[]> {
  await ensureBackupDir();
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups: BackupMetadata[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      if (file.endsWith(".meta.json")) continue;
      const metaPath = path.join(BACKUP_DIR, `${file}.meta.json`);
      try {
        const metaRaw = await fs.readFile(metaPath, "utf-8");
        backups.push(JSON.parse(metaRaw) as BackupMetadata);
      } catch {
        // No metadata file — create basic metadata from the backup file
        const filePath = path.join(BACKUP_DIR, file);
        const stat = await fs.stat(filePath);
        backups.push({
          id: file.replace(/\.json$/, ""),
          filename: file,
          createdAt: stat.mtime.toISOString(),
          createdBy: "unknown",
          totalPages: 0,
          totalSize: stat.size,
          pageTypes: {},
          status: "completed",
        });
      }
    }
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return backups;
  } catch (err) {
    log.error("Failed to list backups", { error: String(err) });
    return [];
  }
}

export async function createBackup(
  pages: Array<Record<string, unknown>>,
  createdBy: string
): Promise<BackupMetadata> {
  await ensureBackupDir();
  const id = `backup_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const filename = `${id}.json`;
  const filePath = path.join(BACKUP_DIR, filename);

  const pageTypes: Record<string, number> = {};
  for (const page of pages) {
    const type = (page.type as string) || "unknown";
    pageTypes[type] = (pageTypes[type] || 0) + 1;
  }

  const exportData = {
    export_metadata: {
      type: "full_backup",
      generated_at: new Date().toISOString(),
      created_by: createdBy,
      total_pages: pages.length,
      format: "JSON",
    },
    pages,
  };

  const content = JSON.stringify(exportData, null, 2);
  await fs.writeFile(filePath, content, "utf-8");

  const stat = await fs.stat(filePath);
  const metadata: BackupMetadata = {
    id,
    filename,
    createdAt: new Date().toISOString(),
    createdBy,
    totalPages: pages.length,
    totalSize: stat.size,
    pageTypes,
    status: "completed",
  };

  const metaPath = path.join(BACKUP_DIR, `${filename}.meta.json`);
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf-8");

  log.info("Backup created", { id, pages: pages.length, size: stat.size });
  return metadata;
}

export async function getBackupFile(
  id: string
): Promise<{ content: string; metadata: BackupMetadata } | null> {
  await ensureBackupDir();
  const filename = `${id}.json`;
  const filePath = path.join(BACKUP_DIR, filename);
  const metaPath = path.join(BACKUP_DIR, `${filename}.meta.json`);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    let metadata: BackupMetadata;
    try {
      const metaRaw = await fs.readFile(metaPath, "utf-8");
      metadata = JSON.parse(metaRaw);
    } catch {
      const stat = await fs.stat(filePath);
      metadata = {
        id,
        filename,
        createdAt: stat.mtime.toISOString(),
        createdBy: "unknown",
        totalPages: 0,
        totalSize: stat.size,
        pageTypes: {},
        status: "completed",
      };
    }
    return { content, metadata };
  } catch {
    return null;
  }
}

export async function deleteBackup(id: string): Promise<boolean> {
  await ensureBackupDir();
  const filename = `${id}.json`;
  const filePath = path.join(BACKUP_DIR, filename);
  const metaPath = path.join(BACKUP_DIR, `${filename}.meta.json`);

  let deleted = false;
  try {
    await fs.unlink(filePath);
    deleted = true;
  } catch {}
  try {
    await fs.unlink(metaPath);
  } catch {}
  return deleted;
}

export async function getBackupStats(): Promise<{
  totalBackups: number;
  totalSize: number;
  lastBackupAt: string | null;
  oldestBackupAt: string | null;
}> {
  const backups = await listBackups();
  if (backups.length === 0) {
    return { totalBackups: 0, totalSize: 0, lastBackupAt: null, oldestBackupAt: null };
  }
  const totalSize = backups.reduce((sum, b) => sum + b.totalSize, 0);
  const lastBackupAt = backups[0]?.createdAt ?? null;
  const oldestBackupAt = backups[backups.length - 1]?.createdAt ?? null;
  return { totalBackups: backups.length, totalSize, lastBackupAt, oldestBackupAt };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
