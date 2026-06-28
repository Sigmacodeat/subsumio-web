/**
 * file-store — the single place that persists an uploaded file's BYTES.
 *
 * The binary-storage SSOT is the `files` table (migration 39) plus the pluggable
 * `StorageBackend` (`./storage.ts`). Both the local CLI `file_upload` operation
 * and the web `/api/upload` HTTP handler funnel through `persistFileBuffer` so the
 * hashing, storage-path convention, dedup, backend write, and DB row all live in
 * ONE implementation — no parallel storage path.
 *
 * Callers differ only in how they obtain the bytes (CLI reads a filesystem path;
 * the web handler already holds a Buffer from the multipart parse).
 */

import * as db from "./db.ts";
import { configDir } from "./config.ts";
import { createStorage, type StorageConfig } from "./storage.ts";
import { createHash } from "crypto";
import { join } from "path";

/** Extension → MIME, shared with the `file_upload` operation.
 *
 * Mirrors the web-layer allowlist in `src/lib/upload-formats.ts` so every
 * persisted file gets a correct `mime_type` in the `files` table. Without
 * this, downloads via `readStoredFile` return `mimeType: null` → wrong
 * Content-Type header. Keep in sync with `UPLOAD_ACCEPT` when formats are
 * added. */
export const FILE_MIME_TYPES: Record<string, string> = {
  // Images
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".docm": "application/vnd.ms-word.document.macroenabled.12",
  ".rtf": "application/rtf",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroenabled.12",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pptm": "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  ".pages": "application/vnd.apple.pages",
  ".key": "application/vnd.apple.keynote",
  ".numbers": "application/vnd.apple.numbers",
  // Email
  ".eml": "message/rfc822",
  ".msg": "application/vnd.ms-outlook",
  ".pst": "application/vnd.ms-outlook",
  // Text
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".xml": "application/xml",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  // Archives
  ".zip": "application/zip",
};

/** Thrown on storage-backend or DB failure; callers map to their error shape. */
export class FileStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStoreError";
  }
}

export interface PersistFileResult {
  status: "uploaded" | "already_exists";
  storage_path: string;
  size_bytes: number;
  content_hash: string;
}

export interface PersistFileOptions {
  data: Buffer;
  filename: string;
  /** Page the file belongs to. Drives the storage path and DB linkage. */
  pageSlug?: string | null;
  /** Explicit MIME; derived from the filename extension when omitted. */
  mimeType?: string | null;
  /** Tenant source for isolation. Defaults to 'default' (single-tenant CLI). */
  sourceId?: string;
  /** Storage backend config (ctx.config.storage). Falls back to local /data. */
  storageConfig?: unknown;
  /** Storage zone: unscanned (default), clean (scan passed), quarantined (scan failed). */
  zone?: StorageZone;
}

export interface StoredUploadMatch {
  page_slug: string | null;
  filename: string;
  content_hash: string;
}

/** Tenant-scoped duplicate lookup against the durable original-file index. */
export async function findStoredUploadByHash(
  data: Buffer,
  sourceId: string
): Promise<StoredUploadMatch | null> {
  const hash = createHash("sha256").update(data).digest("hex");
  const sql = db.getConnection();
  const rows = await sql`
    SELECT page_slug, filename, content_hash
    FROM files
    WHERE source_id = ${sourceId} AND content_hash = ${hash}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0] as StoredUploadMatch) : null;
}

/** Return the current original stored for a page, if any. */
export async function findStoredUploadForPage(
  pageSlug: string,
  sourceId: string
): Promise<StoredUploadMatch | null> {
  const sql = db.getConnection();
  const rows = await sql`
    SELECT page_slug, filename, content_hash
    FROM files
    WHERE source_id = ${sourceId} AND page_slug = ${pageSlug}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows.length > 0 ? (rows[0] as StoredUploadMatch) : null;
}

/**
 * Resolve the storage backend config. When the caller has none configured, fall
 * back to LocalStorage rooted under the gbrain home dir (the Hetzner /data
 * volume), so bytes are always persisted somewhere durable.
 */
function resolveStorageConfig(storageConfig?: unknown): StorageConfig {
  if (storageConfig && typeof storageConfig === "object") {
    return storageConfig as StorageConfig;
  }
  return {
    backend: "local",
    bucket: "brain-files",
    localPath: join(configDir(), "files"),
  };
}

function mimeForFilename(filename: string, explicit?: string | null): string | null {
  if (explicit) return explicit;
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return null;
  return FILE_MIME_TYPES[filename.slice(dot).toLowerCase()] ?? null;
}

/**
 * Storage zone prefixes — separates files by scan status so a compromised
 * file never sits in the same prefix as a clean one. Follows the Google Cloud
 * best practice of unscanned → clean → quarantined bucket separation.
 *
 *   unscanned/  — freshly uploaded, security scan pending or in-flight
 *   clean/      — passed security scan, safe for retrieval and processing
 *   quarantined/— failed security scan, retained for audit but not retrievable
 */
export type StorageZone = "unscanned" | "clean" | "quarantined";

function zonePrefix(zone: StorageZone): string {
  return zone;
}

/**
 * Move a file from one storage zone to another by copying + deleting.
 * Used after the security scan verdict to transition unscanned → clean
 * or unscanned → quarantined.
 */
export async function moveFileZone(
  fromZone: StorageZone,
  toZone: StorageZone,
  storagePath: string,
  storageConfig?: unknown
): Promise<string> {
  const config = resolveStorageConfig(storageConfig);
  const storage = await createStorage(config);
  const fromPath = `${fromZone}/${storagePath}`;
  const toPath = `${toZone}/${storagePath}`;

  // Read from source zone
  const data = await storage.download(fromPath);
  // Write to destination zone
  await storage.upload(toPath, data);
  // Delete from source zone
  try {
    await storage.delete(fromPath);
  } catch {
    /* best-effort */
  }

  // Update DB row to reflect new path
  const sql = db.getConnection();
  await sql`UPDATE files SET storage_path = ${toPath} WHERE storage_path = ${fromPath}`;

  return toPath;
}

/**
 * Persist a file's bytes + register the `files` row. Idempotent: a re-upload of
 * identical content to the same storage path is a no-op (`already_exists`).
 *
 * Files land in the `unscanned/` zone by default. After the caller's security
 * scan passes, call `moveFileZone("unscanned", "clean", ...)` to transition.
 */
export async function persistFileBuffer(opts: PersistFileOptions): Promise<PersistFileResult> {
  const { data, filename, pageSlug = null, sourceId = "default", zone = "unscanned" } = opts;
  const mimeType = mimeForFilename(filename, opts.mimeType);

  const hash = createHash("sha256").update(data).digest("hex");
  const tenantKey = `tenant-${createHash("sha256").update(sourceId).digest("hex").slice(0, 20)}`;
  const basePath = pageSlug
    ? `${tenantKey}/${pageSlug}/${filename}`
    : `${tenantKey}/unsorted/${hash.slice(0, 8)}-${filename}`;
  const storagePath = `${zonePrefix(zone)}/${basePath}`;

  const sql = db.getConnection();
  const existing =
    await sql`SELECT id FROM files WHERE source_id = ${sourceId} AND content_hash = ${hash} AND storage_path = ${storagePath}`;
  if (existing.length > 0) {
    return {
      status: "already_exists",
      storage_path: storagePath,
      size_bytes: data.byteLength,
      content_hash: hash,
    };
  }

  const config = resolveStorageConfig(opts.storageConfig);
  const storage = await createStorage(config);
  try {
    await storage.upload(storagePath, data, mimeType || undefined);
  } catch (uploadErr) {
    throw new FileStoreError(
      `Upload failed: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`
    );
  }

  try {
    await sql`
      INSERT INTO files (source_id, page_slug, filename, storage_path, mime_type, size_bytes, content_hash)
      VALUES (${sourceId}, ${pageSlug}, ${filename}, ${storagePath}, ${mimeType}, ${data.byteLength}, ${hash})
      ON CONFLICT (storage_path) DO UPDATE SET
        content_hash = EXCLUDED.content_hash,
        size_bytes = EXCLUDED.size_bytes,
        mime_type = EXCLUDED.mime_type
    `;
  } catch (dbErr) {
    // Rollback: drop the just-written object so storage and DB don't diverge.
    try {
      await storage.delete(storagePath);
    } catch {
      /* best-effort cleanup */
    }
    throw new FileStoreError(
      `DB write failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`
    );
  }

  return {
    status: "uploaded",
    storage_path: storagePath,
    size_bytes: data.byteLength,
    content_hash: hash,
  };
}

/**
 * Look up a stored file row by page slug (tenant-scoped) and stream-read its
 * bytes from the backend. Returns null when no row exists. Used by the download
 * route. Picks the most recently created file for the slug.
 */
export async function readStoredFile(
  pageSlug: string,
  sourceId: string,
  storageConfig?: unknown
): Promise<{ data: Buffer; filename: string; mimeType: string | null } | null> {
  const sql = db.getConnection();
  const rows = await sql`
    SELECT filename, storage_path, mime_type
    FROM files
    WHERE page_slug = ${pageSlug} AND source_id = ${sourceId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;

  const row = rows[0] as { filename: string; storage_path: string; mime_type: string | null };

  // Refuse downloads from the quarantined zone — retained for audit, not retrieval
  if (row.storage_path.startsWith("quarantined/")) {
    throw new FileStoreError(
      "File is quarantined and cannot be downloaded. Contact your administrator."
    );
  }

  const storage = await createStorage(resolveStorageConfig(storageConfig));
  const data = await storage.download(row.storage_path);
  return { data, filename: row.filename, mimeType: row.mime_type };
}

/** Permanently delete every original object linked to one tenant/page. */
export async function purgeStoredFilesForPage(
  pageSlug: string,
  sourceId: string,
  storageConfig?: unknown
): Promise<number> {
  const sql = db.getConnection();
  const rows = (await sql`
    SELECT id, storage_path
    FROM files
    WHERE page_slug = ${pageSlug} AND source_id = ${sourceId}
    ORDER BY id
  `) as Array<{ id: number; storage_path: string }>;
  if (rows.length === 0) return 0;

  const storage = await createStorage(resolveStorageConfig(storageConfig));
  for (const row of rows) {
    await storage.delete(row.storage_path);
  }
  const ids = rows.map((row) => row.id);
  await sql`DELETE FROM files WHERE source_id = ${sourceId} AND id = ANY(${ids}::int[])`;
  return rows.length;
}

/** Permanently delete every original object owned by one tenant source. */
export async function purgeStoredFilesForSource(
  sourceId: string,
  storageConfig?: unknown
): Promise<number> {
  const sql = db.getConnection();
  const rows = (await sql`
    SELECT id, storage_path
    FROM files
    WHERE source_id = ${sourceId}
    ORDER BY id
  `) as Array<{ id: number; storage_path: string }>;
  if (rows.length === 0) return 0;

  const storage = await createStorage(resolveStorageConfig(storageConfig));
  for (const row of rows) {
    await storage.delete(row.storage_path);
  }
  await sql`DELETE FROM files WHERE source_id = ${sourceId}`;
  return rows.length;
}
