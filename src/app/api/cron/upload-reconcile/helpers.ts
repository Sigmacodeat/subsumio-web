export const GRACE_MINUTES = 15;
const EXTRACTION_READY = new Set(["ready", "partial", "text_layer", "ocr_complete"]);

export interface DocPage {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

export function minutesSince(isoStr: unknown): number {
  if (typeof isoStr !== "string" || !isoStr) return Infinity;
  const then = new Date(isoStr).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / (1000 * 60);
}

/** A document that is extraction-ready but has no live analysis tracking. */
export function isStuck(doc: DocPage): boolean {
  const fm = doc.frontmatter ?? {};
  const extraction = String(fm.extraction_status ?? "");
  if (!EXTRACTION_READY.has(extraction)) return false;

  const analysis = fm.analysis_status;
  // Missing status → task was never created (the blackhole).
  if (analysis === undefined || analysis === null || analysis === "") {
    // Only sweep once the document has settled, so we don't race a normal drain
    // that is about to enqueue it.
    const age = Math.min(
      minutesSince(fm.uploaded_at),
      minutesSince(fm.extraction_completed_at),
      minutesSince(fm.created_at)
    );
    return age >= GRACE_MINUTES;
  }
  // Stuck on "pending" well past the point the 2-min drain should have run it.
  if (analysis === "pending") {
    const age = Math.min(minutesSince(fm.analysis_queued_at), minutesSince(fm.uploaded_at));
    return age >= GRACE_MINUTES;
  }
  // Anything else (completed / failed / retrying / queued / deferred /
  // permanently_failed) is tracked elsewhere — leave it alone.
  return false;
}
