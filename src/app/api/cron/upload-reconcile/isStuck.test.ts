import { describe, it, expect } from "vitest";
import { isStuck, GRACE_MINUTES, type DocPage } from "./helpers";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const OLD = minutesAgo(GRACE_MINUTES + 5);
const RECENT = minutesAgo(GRACE_MINUTES - 5);

function doc(frontmatter: Record<string, unknown>): DocPage {
  return { slug: "documents/x", title: "X", frontmatter };
}

describe("upload-reconcile isStuck", () => {
  it("sweeps an extraction-ready doc with MISSING analysis_status past the grace window", () => {
    expect(isStuck(doc({ extraction_status: "ready", uploaded_at: OLD }))).toBe(true);
  });

  it("sweeps a doc stuck on analysis_status=pending past the grace window", () => {
    expect(
      isStuck(
        doc({ extraction_status: "ready", analysis_status: "pending", analysis_queued_at: OLD })
      )
    ).toBe(true);
  });

  it("does NOT sweep a recently-uploaded doc (still within the grace window)", () => {
    expect(isStuck(doc({ extraction_status: "ready", uploaded_at: RECENT }))).toBe(false);
  });

  it("does NOT sweep a doc that is still extracting", () => {
    expect(isStuck(doc({ extraction_status: "processing", uploaded_at: OLD }))).toBe(false);
  });

  it("does NOT sweep an already-analyzed doc (completed)", () => {
    expect(
      isStuck(doc({ extraction_status: "ready", analysis_status: "completed", uploaded_at: OLD }))
    ).toBe(false);
  });

  it("does NOT sweep a failed doc (owned by the analysis-retry cron)", () => {
    expect(
      isStuck(doc({ extraction_status: "ready", analysis_status: "failed", uploaded_at: OLD }))
    ).toBe(false);
  });

  it.each(["retrying", "queued", "deferred", "permanently_failed"])(
    "does NOT sweep a doc tracked elsewhere (%s)",
    (status) => {
      expect(
        isStuck(doc({ extraction_status: "ready", analysis_status: status, uploaded_at: OLD }))
      ).toBe(false);
    }
  );

  it("accepts ocr_complete / text_layer / partial as extraction-ready", () => {
    for (const extraction of ["ocr_complete", "text_layer", "partial"]) {
      expect(isStuck(doc({ extraction_status: extraction, uploaded_at: OLD }))).toBe(true);
    }
  });

  it("treats a missing/invalid timestamp as old enough to sweep (Infinity age)", () => {
    expect(isStuck(doc({ extraction_status: "ready" }))).toBe(true);
    expect(isStuck(doc({ extraction_status: "ready", uploaded_at: "not-a-date" }))).toBe(true);
  });
});
