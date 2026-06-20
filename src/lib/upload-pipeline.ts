/**
 * Central upload pipeline — combines validation, virus scanning, and
 * filename sanitization into a single callable step.
 *
 * Every upload path in the application should use `scanUpload()` instead
 * of calling validateUpload + scanFile + sanitizeFilename individually.
 *
 * Pipeline stages:
 *   1. validateUpload — MIME allowlist, size limit, file presence
 *   2. sanitizeFilename — strip path traversal, special chars
 *   3. scanFile — magic-byte validation, executable detection, ClamAV
 *
 * Usage:
 *   const result = await scanUpload(file);
 *   if (!result.ok) return Response.json(result, { status: result.status });
 *   // result.file, result.buffer, result.cleanName are ready to use
 */

import { validateUpload, sanitizeFilename, type UploadValidation } from "@/lib/upload-validation";
import { scanFile, type ScanResult } from "@/lib/virus-scan";
import { createHash } from "crypto";

export interface DuplicateCheckResult {
  is_duplicate: boolean;
  sha256: string;
  existing_slug?: string;
  existing_name?: string;
}

export type DuplicateStore = {
  /** Look up a SHA-256 hash. Returns the existing file metadata if found. */
  lookup: (sha256: string) => Promise<{ slug: string; name: string } | null>;
  /** Record a new file hash with its slug and name. */
  record: (sha256: string, slug: string, name: string) => Promise<void>;
};

export type UploadPipelineResult =
  | {
      ok: true;
      file: File;
      buffer: ArrayBuffer;
      cleanName: string;
      mimeType: string;
      sha256: string;
      is_duplicate: boolean;
      existing_slug?: string;
      existing_name?: string;
    }
  | {
      ok: false;
      error: string;
      message: string;
      status: number;
    };

/**
 * Run the full upload security pipeline on a file.
 * Returns either a safe-to-use file with buffer and cleaned name,
 * or an error with HTTP status and user-facing message.
 */
export async function scanUpload(file: unknown): Promise<UploadPipelineResult> {
  // Stage 1: Basic validation (MIME type, size, presence)
  const validation = validateUpload(file);
  if (!validation.ok) {
    const status =
      validation.error === "file_required" ? 400
      : validation.error === "file_too_large" ? 413
      : 415;
    const messages: Record<string, string> = {
      file_required: "Keine Datei übermittelt.",
      file_too_large: `Datei überschreitet das Limit von ${Math.round((validation.maxSize ?? 0) / 1024 / 1024)} MB.`,
      unsupported_file_type: "Dateityp nicht erlaubt.",
    };
    return {
      ok: false,
      error: validation.error,
      message: messages[validation.error] ?? "Upload abgelehnt.",
      status,
    };
  }

  const validFile = validation.file;
  const cleanName = sanitizeFilename(validFile.name);

  // Stage 2: Read file buffer for scanning
  const buffer = await validFile.arrayBuffer();

  // Stage 2b: Compute SHA-256 hash for duplicate detection
  const sha256 = computeSHA256(buffer);

  // Stage 3: Virus / malware scan
  const scanResult = await scanFile(buffer, validFile.type);
  if (!scanResult.ok) {
    let message = "Upload abgelehnt.";
    switch (scanResult.reason) {
      case "executable_detected":
        message = `Datei enthält ausführbaren Code (${scanResult.label}) — Upload abgelehnt.`;
        break;
      case "mime_mismatch":
        message = "Dateiinhalt stimmt nicht mit deklariertem Typ überein — Upload abgelehnt.";
        break;
      case "clamav_infected":
        message = `Datei ist infiziert (${scanResult.signature}) — Upload abgelehnt.`;
        break;
      case "clamav_unreachable":
        message = "Virenscanner nicht erreichbar — bitte erneut versuchen.";
        break;
    }
    return {
      ok: false,
      error: scanResult.reason,
      message,
      status: 422,
    };
  }

  return {
    ok: true,
    file: validFile,
    buffer,
    cleanName,
    mimeType: validFile.type,
    sha256,
    is_duplicate: false,
  };
}

/**
 * Compute SHA-256 hash of a buffer.
 */
export function computeSHA256(buffer: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

/**
 * Check for duplicates using a DuplicateStore.
 * Returns the duplicate check result without recording — call `recordDuplicate` after saving.
 */
export async function checkDuplicate(
  sha256: string,
  store: DuplicateStore,
): Promise<DuplicateCheckResult> {
  const existing = await store.lookup(sha256);
  if (existing) {
    return {
      is_duplicate: true,
      sha256,
      existing_slug: existing.slug,
      existing_name: existing.name,
    };
  }
  return { is_duplicate: false, sha256 };
}

/**
 * Record a file hash in the duplicate store after it has been saved.
 */
export async function recordDuplicate(
  sha256: string,
  slug: string,
  name: string,
  store: DuplicateStore,
): Promise<void> {
  await store.record(sha256, slug, name);
}

/**
 * Extended upload pipeline with duplicate detection.
 * Use this when a DuplicateStore is available.
 */
export async function scanUploadWithDuplicateCheck(
  file: unknown,
  store: DuplicateStore,
): Promise<UploadPipelineResult> {
  const base = await scanUpload(file);
  if (!base.ok) return base;

  const dupCheck = await checkDuplicate(base.sha256, store);
  if (dupCheck.is_duplicate) {
    return {
      ok: false,
      error: "duplicate_file",
      message: `Datei bereits vorhanden: „${dupCheck.existing_name}" (Slug: ${dupCheck.existing_slug})`,
      status: 409,
    };
  }

  return {
    ...base,
    is_duplicate: false,
  };
}
