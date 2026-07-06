import { describe, expect, it } from "vitest";
import { resolveDocumentReadiness } from "./document-readiness";

describe("resolveDocumentReadiness", () => {
  it("never exposes a processing stub", () => {
    expect(resolveDocumentReadiness({ extraction_status: "processing" })).toBe("processing");
  });

  it("keeps incomplete OCR explicitly partial", () => {
    expect(
      resolveDocumentReadiness({
        extraction_status: "ready",
        embedding_status: "ready",
        extraction_coverage_percent: 20,
      })
    ).toBe("partial");
  });

  it("separates semantic indexing from completed analysis", () => {
    expect(
      resolveDocumentReadiness({
        extraction_status: "ready",
        embedding_status: "ready",
        analysis_status: "running",
      })
    ).toBe("indexed");
    expect(
      resolveDocumentReadiness({
        extraction_status: "ready",
        embedding_status: "ready",
        analysis_status: "completed",
      })
    ).toBe("copilot_ready");
  });

  it("fails closed for extraction errors", () => {
    expect(resolveDocumentReadiness({ extraction_status: "ocr_failed" })).toBe("failed");
  });
});
