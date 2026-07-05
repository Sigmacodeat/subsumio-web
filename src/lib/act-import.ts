export type ActImportItemStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "ready"
  | "partial"
  | "review"
  | "duplicate"
  | "failed";

export interface ActImportItem {
  id: string;
  sessionId: string;
  caseSlug: string;
  relativePath: string;
  filename: string;
  size: number;
  mimeType?: string;
  sha256?: string;
  documentSlug?: string;
  partSlugs?: string[];
  status: ActImportItemStatus;
  extractionStatus?: string;
  extractionMethod?: string;
  embeddingStatus?: string;
  classification?: string;
  jurisdiction?: string;
  onCount?: number;
  pageCount?: number;
  warningCount?: number;
  errorCode?: string;
  error?: string;
  attempts: number;
  updatedAt: string;
}

export interface ActImportMetrics {
  total: number;
  bytes: number;
  pending: number;
  processing: number;
  ready: number;
  partial: number;
  review: number;
  duplicates: number;
  failed: number;
  classified: number;
  withOnNumbers: number;
  pages: number;
  warnings: number;
  readinessPercent: number;
  classificationPercent: number;
  onCoveragePercent: number;
  canFinalize: boolean;
}

export function computeActImportMetrics(items: ActImportItem[]): ActImportMetrics {
  const count = (status: ActImportItemStatus) => items.filter((i) => i.status === status).length;
  const ready = count("ready");
  const partial = count("partial");
  const review = count("review");
  const duplicates = count("duplicate");
  const terminalUsable = ready + partial + review + duplicates;
  const total = items.length;
  const classified = items.filter((i) => Boolean(i.classification)).length;
  const withOnNumbers = items.filter((i) => (i.onCount ?? 0) > 0).length;
  return {
    total,
    bytes: items.reduce((sum, i) => sum + Math.max(0, i.size || 0), 0),
    pending: count("pending") + count("uploading"),
    processing: count("processing"),
    ready,
    partial,
    review,
    duplicates,
    failed: count("failed"),
    classified,
    withOnNumbers,
    pages: items.reduce((sum, i) => sum + Math.max(0, i.pageCount ?? 0), 0),
    warnings: items.reduce((sum, i) => sum + Math.max(0, i.warningCount ?? 0), 0),
    readinessPercent: total ? Math.round((terminalUsable / total) * 10000) / 100 : 0,
    classificationPercent: total ? Math.round((classified / total) * 10000) / 100 : 0,
    onCoveragePercent: total ? Math.round((withOnNumbers / total) * 10000) / 100 : 0,
    canFinalize: total > 0 && terminalUsable === total && count("failed") === 0,
  };
}

export function actImportSessionSlug(id: string): string {
  return `act-imports/${id}`;
}

export function actImportItemSlug(sessionId: string, id: string): string {
  return `act-import-items/${sessionId}/${id}`;
}

export function safeImportId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || normalized.length > 120) throw new Error("invalid_import_id");
  return normalized;
}
