/**
 * Pure upload validation helpers — route-agnostic and testable.
 */

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25 MB for images

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/tiff",
]);

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
  | { ok: false; error: "file_required" | "file_too_large" | "unsupported_file_type"; maxSize?: number; allowed?: string[] };

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
