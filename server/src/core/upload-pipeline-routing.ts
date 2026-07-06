/** Canonical ownership rules for document ingestion and case analysis. */
export function uploadPipelineCaseSlug(documentSlug: string, caseSlug?: string): string {
  const assignedCase = caseSlug?.trim();
  return assignedCase || documentSlug;
}

export function shouldAutoTriggerUploadPipeline(deferPipeline: unknown): boolean {
  return deferPipeline !== "true";
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
