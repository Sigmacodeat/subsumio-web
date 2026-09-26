/** Canonical ownership rules for document ingestion and case analysis. */
export function uploadPipelineCaseSlug(documentSlug: string, caseSlug?: string): string {
  const assignedCase = caseSlug?.trim();
  return assignedCase || documentSlug;
}

/**
 * Sources that represent legal documents and should trigger the legal pipeline.
 * Mirrors the web app's LEGAL_SOURCES set. Non-legal sources (wiki, meetings,
 * ideas, people, companies, chat) are brain-wide reference material, not
 * case-specific documents — running a 7-layer legal analysis on them wastes
 * credits and produces nonsensical output.
 */
const LEGAL_PIPELINE_SOURCES = new Set(["documents", "legal_case", "legal"]);

export function shouldAutoTriggerUploadPipeline(deferPipeline: unknown, source?: string): boolean {
  // G24 fix: coerce to string before comparing. Pre-fix, `=== "true"` only
  // matched the string "true" — a boolean `true` or any other type would
  // fall through and incorrectly trigger the pipeline. Now we handle
  // string "true", boolean true, and string "1" consistently.
  const defer =
    typeof deferPipeline === "string" ? deferPipeline === "true" : deferPipeline === true;
  if (defer) return false;
  // Gate on legal sources — non-legal uploads (wiki, meetings, etc.) should
  // not trigger the legal pipeline. Falls back to "documents" for backward
  // compat (pre-fix all uploads triggered the pipeline).
  const src = source ?? "documents";
  return LEGAL_PIPELINE_SOURCES.has(src);
}

/**
 * Source and defer flag of a direct (presign → confirm) upload, fixed at
 * presign time. The signed upload token wins over the request body — it is
 * what the web app authorised; a body `defer_pipeline` may only defer (it
 * never re-enables work a token deferred).
 */
export function presignPipelineRouting(input: {
  payload: { source?: string; defer_pipeline?: boolean } | null;
  bodySource?: unknown;
  bodyDefer?: unknown;
}): { source: string; deferPipeline: boolean } {
  const source =
    input.payload?.source ||
    (typeof input.bodySource === "string" && input.bodySource) ||
    "documents";
  const bodyDefer =
    typeof input.bodyDefer === "string" ? input.bodyDefer === "true" : input.bodyDefer === true;
  return { source, deferPipeline: input.payload?.defer_pipeline === true || bodyDefer };
}

/**
 * What a confirmed direct upload triggers. A deferred upload (bulk matter
 * import) starts neither its own legal pipeline nor per-document post-upload
 * tasks — the import's single case-level pipeline covers it. Non-legal
 * sources never start the legal pipeline.
 */
export function confirmPipelinePlan(pending: { source?: string; deferPipeline?: boolean }): {
  autoTriggerLegalPipeline: boolean;
  persistPostUploadTasks: boolean;
  pipelineDeferred: boolean;
} {
  const deferred = pending.deferPipeline === true;
  return {
    autoTriggerLegalPipeline: shouldAutoTriggerUploadPipeline(deferred, pending.source),
    persistPostUploadTasks: !deferred,
    pipelineDeferred: deferred,
  };
}

export function legalPipelineIdempotencyKey(
  sourceId: string,
  caseSlug: string,
  documentSlugs: readonly string[],
  pipelineVersion = 1
): string {
  const corpus = [...documentSlugs].sort().join("\n");
  const digest = createHash("sha256")
    .update(`${sourceId}\n${caseSlug}\n${pipelineVersion}\n${corpus}`)
    .digest("hex");
  return `legal-pipeline:v${pipelineVersion}:${digest}`;
}
import { createHash } from "node:crypto";
