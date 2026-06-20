/**
 * Extraction-Statusmodell für Upload-Pipeline und Document Intelligence.
 *
 * Trackt den gesamten Lifecycle eines Dokuments von Upload über
 * Virenscan, Text-Extraction, OCR bis zur Bereitstellung für AI/Suche.
 *
 * Status-Übergänge (State Machine):
 *
 *   uploaded → processing → text_layer → ready
 *                        ↘ ocr_needed → ocr_processing → ocr_complete → ready
 *                                                    ↘ ocr_failed
 *   any → error (fatal)
 *   ocr_complete/ocr_failed → ocr_needed (re-OCR)
 */

export type ExtractionStatus =
  | "uploaded"
  | "processing"
  | "text_layer"
  | "ocr_needed"
  | "ocr_processing"
  | "ocr_complete"
  | "ocr_failed"
  | "ready"
  | "error";

export type ExtractionMethod = "text_layer" | "ocr_vision" | "none";

export interface ExtractionMetadata {
  status: ExtractionStatus;
  extraction_method?: ExtractionMethod;
  extraction_unverified?: boolean;
  ocr_attempted_at?: string;
  ocr_completed_at?: string;
  ocr_error?: string;
  page_count?: number;
  char_count?: number;
  language?: string;
  uploaded_at?: string;
  processed_at?: string;
}

const VALID_TRANSITIONS: Record<ExtractionStatus, ExtractionStatus[]> = {
  uploaded: ["processing", "error"],
  processing: ["text_layer", "ocr_needed", "ready", "error"],
  text_layer: ["ready", "error"],
  ocr_needed: ["ocr_processing", "ocr_failed", "error"],
  ocr_processing: ["ocr_complete", "ocr_failed", "error"],
  ocr_complete: ["ready", "ocr_needed"],
  ocr_failed: ["ocr_needed", "error"],
  ready: ["ocr_needed"],
  error: [],
};

export function canTransition(from: ExtractionStatus, to: ExtractionStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transition(
  current: ExtractionStatus,
  next: ExtractionStatus,
): ExtractionStatus {
  if (!canTransition(current, next)) {
    throw new Error(
      `Invalid extraction status transition: ${current} → ${next}`,
    );
  }
  return next;
}

export function isTerminal(status: ExtractionStatus): boolean {
  return status === "ready" || status === "error";
}

export function isOcrRequired(status: ExtractionStatus): boolean {
  return status === "ocr_needed" || status === "ocr_processing";
}

export function isReady(status: ExtractionStatus): boolean {
  return status === "ready";
}

export function isFailed(status: ExtractionStatus): boolean {
  return status === "error" || status === "ocr_failed";
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".avif", ".webp", ".bmp", ".gif"];
const TEXT_EXTENSIONS = [".docx", ".doc", ".txt", ".md", ".mdx", ".rtf", ".odt", ".html", ".htm", ".csv", ".xlsx", ".xls"];

export function inferInitialExtractionStatus(
  filename: string,
  mimeType: string,
): ExtractionStatus {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[0] ?? "";
  const isImage = IMAGE_EXTENSIONS.includes(ext) || mimeType.startsWith("image/");
  const isPdf = ext === ".pdf" || mimeType === "application/pdf";

  if (isPdf) return "processing";
  if (isImage) return "ocr_needed";
  if (TEXT_EXTENSIONS.includes(ext) || mimeType.startsWith("text/") || mimeType.includes("document") || mimeType.includes("spreadsheet")) {
    return "processing";
  }
  return "processing";
}

export function inferExtractionMethod(
  status: ExtractionStatus,
  hadOcr: boolean,
): ExtractionMethod {
  if (status === "ocr_complete" || (hadOcr && status === "ready")) return "ocr_vision";
  if (status === "text_layer" || status === "ready") return "text_layer";
  return "none";
}

export function createInitialMetadata(
  filename: string,
  mimeType: string,
): ExtractionMetadata {
  return {
    status: "uploaded",
    uploaded_at: new Date().toISOString(),
  };
}

export function updateMetadataForOcrStart(
  meta: ExtractionMetadata,
): ExtractionMetadata {
  return {
    ...meta,
    status: "ocr_processing",
    ocr_attempted_at: new Date().toISOString(),
    extraction_method: "ocr_vision",
  };
}

export function updateMetadataForOcrComplete(
  meta: ExtractionMetadata,
  result: { char_count?: number; page_count?: number; language?: string },
): ExtractionMetadata {
  return {
    ...meta,
    status: "ocr_complete",
    ocr_completed_at: new Date().toISOString(),
    extraction_method: "ocr_vision",
    extraction_unverified: true,
    char_count: result.char_count,
    page_count: result.page_count,
    language: result.language,
  };
}

export function updateMetadataForOcrFailure(
  meta: ExtractionMetadata,
  error: string,
): ExtractionMetadata {
  return {
    ...meta,
    status: "ocr_failed",
    ocr_error: error,
    ocr_completed_at: new Date().toISOString(),
  };
}

export function updateMetadataForTextLayer(
  meta: ExtractionMetadata,
  result: { char_count?: number; page_count?: number; language?: string },
): ExtractionMetadata {
  return {
    ...meta,
    status: "text_layer",
    extraction_method: "text_layer",
    char_count: result.char_count,
    page_count: result.page_count,
    language: result.language,
  };
}

export function markReady(meta: ExtractionMetadata): ExtractionMetadata {
  return {
    ...meta,
    status: "ready",
    processed_at: new Date().toISOString(),
  };
}

export function markError(meta: ExtractionMetadata, error: string): ExtractionMetadata {
  return {
    ...meta,
    status: "error",
    ocr_error: error,
    processed_at: new Date().toISOString(),
  };
}

export function resetForReOcr(meta: ExtractionMetadata): ExtractionMetadata {
  return {
    ...meta,
    status: "ocr_needed",
    ocr_attempted_at: undefined,
    ocr_completed_at: undefined,
    ocr_error: undefined,
  };
}

const STATUS_LABELS: Record<ExtractionStatus, string> = {
  uploaded: "Hochgeladen",
  processing: "Wird verarbeitet",
  text_layer: "Text-Layer erkannt",
  ocr_needed: "OCR erforderlich",
  ocr_processing: "OCR läuft",
  ocr_complete: "OCR abgeschlossen",
  ocr_failed: "OCR fehlgeschlagen",
  ready: "Bereit",
  error: "Fehler",
};

export function statusLabel(status: ExtractionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const STATUS_COLORS: Record<ExtractionStatus, string> = {
  uploaded: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  text_layer: "bg-indigo-100 text-indigo-800",
  ocr_needed: "bg-amber-100 text-amber-800",
  ocr_processing: "bg-amber-100 text-amber-800",
  ocr_complete: "bg-green-100 text-green-800",
  ocr_failed: "bg-red-100 text-red-800",
  ready: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
};

export function statusColor(status: ExtractionStatus): string {
  return STATUS_COLORS[status] ?? "bg-gray-100 text-gray-800";
}
