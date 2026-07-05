/** Canonical ownership rules for document ingestion and case analysis. */
export function uploadPipelineCaseSlug(documentSlug: string, caseSlug?: string): string {
  const assignedCase = caseSlug?.trim();
  return assignedCase || documentSlug;
}

export function shouldAutoTriggerUploadPipeline(deferPipeline: unknown): boolean {
  return deferPipeline !== "true";
}
