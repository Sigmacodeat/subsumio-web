// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  docProcessingStatus,
  partialLabel,
  REVIEW_STATUS_KEYS,
  statusFieldsFromFrontmatter,
} from "@/lib/doc-processing-status";

const key = (fm: Record<string, unknown>) =>
  docProcessingStatus(statusFieldsFromFrontmatter(fm)).key;

describe("docProcessingStatus — engine vocabulary", () => {
  it.each([
    [{ extraction_status: "ready" }, "confirmed"],
    [{ extraction_status: "ready", extraction_unverified: "true" }, "review_open"],
    [{ extraction_status: "ready", extraction_unverified: true }, "review_open"],
    [{ extraction_status: "partial" }, "extraction_partial"],
    [{ extraction_status: "failed" }, "extraction_failed"],
    [
      { extraction_status: "failed", extraction_error_code: "password_required" },
      "extraction_password",
    ],
    [{ extraction_status: "processing" }, "processing"],
    [{ ocr_status: "needs_backfill" }, "ocr_needed"],
    [{ ocr_status: "completed" }, "analyzed"],
    [{ extraction_status: "ready", analysis_status: "failed" }, "analysis_failed"],
    [{}, "uploaded"],
  ])("%j → %s", (fm, expected) => {
    expect(key(fm)).toBe(expected);
  });

  it("nothing the engine reports as a problem shows as plain 'uploaded'", () => {
    for (const fm of [
      { extraction_status: "partial" },
      { extraction_status: "failed" },
      { ocr_status: "needs_backfill" },
      { analysis_status: "failed" },
    ]) {
      expect(key(fm)).not.toBe("uploaded");
      expect(REVIEW_STATUS_KEYS.has(docProcessingStatus(statusFieldsFromFrontmatter(fm)).key)).toBe(
        true
      );
    }
  });

  it("partial label carries the coverage", () => {
    expect(partialLabel({ extraction_coverage_percent: 34 })).toBe("Teilweise gelesen (34 %)");
    expect(partialLabel({})).toBe("Teilweise gelesen");
  });
});
