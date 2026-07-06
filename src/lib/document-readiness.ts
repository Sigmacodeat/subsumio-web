export type DocumentReadiness = "processing" | "partial" | "indexed" | "copilot_ready" | "failed";

export interface DocumentReadinessInput {
  extraction_status?: unknown;
  embedding_status?: unknown;
  analysis_status?: unknown;
  extraction_coverage_percent?: unknown;
}

const FAILED = new Set(["failed", "error", "ocr_failed"]);
const EXTRACTED = new Set(["ready", "text_layer", "ocr_complete"]);

export function resolveDocumentReadiness(input: DocumentReadinessInput): DocumentReadiness {
  const extraction = String(input.extraction_status ?? "processing");
  const embedding = String(input.embedding_status ?? "unknown");
  const analysis = String(input.analysis_status ?? "unknown");
  const coverage = Number(input.extraction_coverage_percent ?? 100);

  if (FAILED.has(extraction)) return "failed";
  if (extraction === "partial" || (Number.isFinite(coverage) && coverage < 100)) return "partial";
  if (!EXTRACTED.has(extraction) || embedding === "pending" || embedding === "processing") {
    return "processing";
  }
  if (embedding !== "ready" && embedding !== "unknown") return "processing";
  if (["pending", "queued", "processing", "running"].includes(analysis)) return "indexed";
  return "copilot_ready";
}

export function isDocumentQueryable(readiness: DocumentReadiness): boolean {
  return readiness === "indexed" || readiness === "copilot_ready";
}
