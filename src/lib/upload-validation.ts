/**
 * Pure upload validation helpers — route-agnostic and testable.
 */

import { env } from "@/lib/env";

/**
 * Upload size limits. Agency-level deployments (Hetzner self-hosted, no platform
 * body cap) accept files up to 1 GB by default. Override per-environment with
 * MAX_UPLOAD_BYTES / MAX_IMAGE_BYTES. Large uploads are throttled client-side by
 * the staggered upload pool (src/lib/upload-queue.ts), so RAM stays bounded.
 */
function resolveLimit(key: string, fallback: number): number {
  const raw = env(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const MAX_FILE_SIZE = resolveLimit("MAX_UPLOAD_BYTES", 1024 * 1024 * 1024); // 1 GB
export const MAX_IMAGE_SIZE = resolveLimit("MAX_IMAGE_BYTES", 200 * 1024 * 1024); // 200 MB

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/tiff"]);

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/markdown",
  "text/plain",
  "text/html",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/rtf",
  "image/png",
  "image/jpeg",
  "image/tiff",
]);

export type UploadValidation =
  | { ok: true; file: File }
  | {
      ok: false;
      error: "file_required" | "file_too_large" | "unsupported_file_type";
      maxSize?: number;
      allowed?: string[];
    };

export function validateUpload(file: unknown): UploadValidation {
  if (!(file instanceof File)) {
    return { ok: false, error: "file_required" };
  }
  const maxForType = IMAGE_MIME_TYPES.has(file.type) ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
  if (file.size > maxForType) {
    return { ok: false, error: "file_too_large", maxSize: maxForType };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: "unsupported_file_type", allowed: Array.from(ALLOWED_MIME_TYPES) };
  }
  return { ok: true, file };
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 200);
}
