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

/** Extension → MIME, shared with the `file_upload` operation. */
export const FILE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".rtf": "application/rtf",
  ".html": "text/html",
  ".htm": "text/html",
  ".eml": "message/rfc822",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
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
 * Persist a file's bytes + register the `files` row. Idempotent: a re-upload of
 * identical content to the same storage path is a no-op (`already_exists`).
 */
export async function persistFileBuffer(opts: PersistFileOptions): Promise<PersistFileResult> {
  const { data, filename, pageSlug = null, sourceId = "default" } = opts;
  const mimeType = mimeForFilename(filename, opts.mimeType);

  const hash = createHash("sha256").update(data).digest("hex");
  const storagePath = pageSlug
    ? `${pageSlug}/${filename}`
    : `unsorted/${hash.slice(0, 8)}-${filename}`;

  const sql = db.getConnection();
  const existing =
    await sql`SELECT id FROM files WHERE content_hash = ${hash} AND storage_path = ${storagePath}`;
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
  const storage = await createStorage(resolveStorageConfig(storageConfig));
  const data = await storage.download(row.storage_path);
  return { data, filename: row.filename, mimeType: row.mime_type };
}
