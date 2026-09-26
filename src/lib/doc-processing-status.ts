/**
 * Processing status of a matter document, from the frontmatter the engine
 * writes on the document page. One place for both vocabularies — the
 * engine's (extraction_status ready | partial | failed | processing,
 * ocr_status needs_backfill | completed, extraction_unverified as boolean or
 * "true") and the older UI values (confirmed, text_layer, ocr_* …) — so a
 * failed or only partly read document never shows as plain "uploaded".
 */

export interface DocStatusFields {
  extraction_status?: string;
  extraction_error_code?: string;
  ocr_status?: string;
  extraction_unverified?: boolean | string;
  analysis_status?: string;
  /** Share of pages read, when the engine stopped early (OCR page limit). */
  extraction_coverage_percent?: number | string;
}

export type DocStatusKey =
  | "analysis_failed"
  | "analysis_retrying"
  | "analysis_permanently_failed"
  | "extraction_password"
  | "extraction_unsupported"
  | "extraction_failed"
  | "extraction_partial"
  | "processing"
  | "confirmed"
  | "review_open"
  | "analyzed"
  | "ocr_processing"
  | "ocr_needed"
  | "text_layer"
  | "uploaded";

const DANGER =
  "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]";
const WARNING =
  "bg-[color:var(--ds-warning-bg)] border-[color:var(--ds-warning-border)] text-[color:var(--ds-warning-text)]";
const INFO =
  "bg-[color:var(--ds-info-bg)] border-[color:var(--ds-info-border)] text-[color:var(--ds-info-text)]";
const SUCCESS =
  "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]";
const NEUTRAL =
  "bg-[color:var(--ds-neutral-bg)] border-[color:var(--ds-neutral-border)] text-[color:var(--ds-neutral-text)]";

const COLOR: Record<DocStatusKey, string> = {
  analysis_failed: DANGER,
  analysis_retrying: INFO,
  analysis_permanently_failed: DANGER,
  extraction_password: WARNING,
  extraction_unsupported: DANGER,
  extraction_failed: DANGER,
  extraction_partial: WARNING,
  processing: INFO,
  confirmed: SUCCESS,
  review_open: WARNING,
  analyzed: INFO,
  ocr_processing: INFO,
  ocr_needed: DANGER,
  text_layer: SUCCESS,
  uploaded: NEUTRAL,
};

function isTrue(v: unknown): boolean {
  return v === true || v === "true";
}

function statusKey(doc: DocStatusFields): DocStatusKey {
  const as = doc.analysis_status;
  if (as === "failed") return "analysis_failed";
  if (as === "retrying") return "analysis_retrying";
  if (as === "permanently_failed") return "analysis_permanently_failed";

  const es = doc.extraction_status;
  if (es === "failed" || es === "error" || es === "permanently_failed") {
    const code = doc.extraction_error_code;
    if (code === "password_required" || code === "invalid_document_password") {
      return "extraction_password";
    }
    if (code === "unsupported_format") return "extraction_unsupported";
    return "extraction_failed";
  }
  if (es === "partial") return "extraction_partial";
  if (es === "processing") return "processing";
  if (es === "ready") return isTrue(doc.extraction_unverified) ? "review_open" : "confirmed";
  if (es === "confirmed" || (es === "text_layer" && !isTrue(doc.extraction_unverified))) {
    return "confirmed";
  }
  if (es === "analyzed" || (es === "text_layer" && isTrue(doc.extraction_unverified))) {
    return "review_open";
  }
  if (es === "ocr_complete") return "analyzed";
  if (es === "ocr_processing") return "ocr_processing";
  if (es === "ocr_needed" || es === "ocr_failed") return "ocr_needed";
  if (es === "uploaded") return "uploaded";

  const ocr = doc.ocr_status;
  if (ocr === "ocr_complete" || ocr === "completed") return "analyzed";
  if (ocr === "ocr_needed" || ocr === "unknown" || ocr === "needs_backfill") return "ocr_needed";
  if (ocr === "text_layer") return "text_layer";
  return "uploaded";
}

export function docProcessingStatus(doc: DocStatusFields): { key: DocStatusKey; color: string } {
  const key = statusKey(doc);
  return { key, color: COLOR[key] };
}

/** "Teilweise gelesen (34 %)" — the coverage when the engine reported one. */
export function partialLabel(doc: DocStatusFields): string {
  const pct = Number(doc.extraction_coverage_percent);
  return Number.isFinite(pct) && pct > 0 && pct < 100
    ? `Teilweise gelesen (${Math.round(pct)} %)`
    : "Teilweise gelesen";
}

/** The status fields of a document page's frontmatter (for merging into list entries). */
export function statusFieldsFromFrontmatter(fm: Record<string, unknown>): DocStatusFields {
  const out: DocStatusFields = {};
  for (const k of [
    "extraction_status",
    "extraction_error_code",
    "ocr_status",
    "analysis_status",
  ] as const) {
    if (typeof fm[k] === "string" && fm[k]) out[k] = fm[k] as string;
  }
  if (fm.extraction_unverified === true || fm.extraction_unverified === "true") {
    out.extraction_unverified = true;
  }
  const cov = fm.extraction_coverage_percent;
  if (typeof cov === "number" || (typeof cov === "string" && cov)) {
    out.extraction_coverage_percent = cov;
  }
  return out;
}

/** Statuses that need a lawyer's attention (counted as open review). */
export const REVIEW_STATUS_KEYS: ReadonlySet<DocStatusKey> = new Set<DocStatusKey>([
  "review_open",
  "ocr_needed",
  "ocr_processing",
  "extraction_partial",
  "extraction_failed",
  "extraction_password",
  "analysis_failed",
  "analysis_permanently_failed",
]);
