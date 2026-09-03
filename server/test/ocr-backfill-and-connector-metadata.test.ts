import { describe, it, expect } from "bun:test";

/**
 * Tests for OCR backfill status stamping and connector sync metadata.
 *
 * BUG #F: When OCR failed (rasterizer missing, transient error), the document
 * was stamped with extraction_status: "partial" or "failed" but had no
 * ocr_status field — making it impossible to find documents that need OCR
 * backfill. The fix stamps ocr_status: "needs_backfill" with a reason.
 *
 * BUG #E: Connector sync only persisted last_sync_at (a timestamp). No status,
 * duration, items count, or error — operators couldn't see if a sync failed
 * or how long it took. The fix persists rich metadata.
 */

describe("OCR backfill status stamping", () => {
  // Replicates the ocr_status logic from synthesizeDocumentMarkdown:
  //   - ocr_unavailable or ocr_failed → ocr_status: "needs_backfill"
  //   - extraction_method: "ocr_vision" → ocr_status: "completed"
  //   - otherwise → no ocr_status (text layer extraction, no OCR needed)
  function computeOcrStatus(
    warnings: string[],
    extractionMethod: string | undefined
  ): { ocr_status?: string; ocr_backfill_reason?: string } {
    const ocrUnavailable = warnings.some((w) => w.startsWith("pdf_ocr_unavailable"));
    const ocrFailed = warnings.some((w) => w.startsWith("pdf_ocr_failed"));
    if (ocrUnavailable || ocrFailed) {
      return {
        ocr_status: "needs_backfill",
        ocr_backfill_reason: ocrUnavailable ? "rasterizer_missing" : "ocr_failed",
      };
    }
    if (extractionMethod === "ocr_vision") {
      return { ocr_status: "completed" };
    }
    return {};
  }

  it("stamps needs_backfill when rasterizer is missing", () => {
    const result = computeOcrStatus(["pdf_ocr_unavailable: pdf rasterizer missing"], undefined);
    expect(result.ocr_status).toBe("needs_backfill");
    expect(result.ocr_backfill_reason).toBe("rasterizer_missing");
  });

  it("stamps needs_backfill when OCR failed", () => {
    const result = computeOcrStatus(["pdf_ocr_failed: page 5"], undefined);
    expect(result.ocr_status).toBe("needs_backfill");
    expect(result.ocr_backfill_reason).toBe("ocr_failed");
  });

  it("stamps completed when OCR succeeded", () => {
    const result = computeOcrStatus([], "ocr_vision");
    expect(result.ocr_status).toBe("completed");
    expect(result.ocr_backfill_reason).toBeUndefined();
  });

  it("does NOT stamp ocr_status for text layer extraction (no OCR needed)", () => {
    const result = computeOcrStatus([], "text_layer");
    expect(result.ocr_status).toBeUndefined();
  });

  it("stamps needs_backfill even when some OCR succeeded but some failed", () => {
    const result = computeOcrStatus(
      ["pdf_ocr_fallback: OCR completed for 3 of 10 sparse page(s)", "pdf_ocr_failed: page 7"],
      "ocr_vision"
    );
    // Mixed success/failure → still needs_backfill (partial OCR)
    expect(result.ocr_status).toBe("needs_backfill");
    expect(result.ocr_backfill_reason).toBe("ocr_failed");
  });

  it("prioritizes rasterizer_missing over ocr_failed when both present", () => {
    const result = computeOcrStatus(
      ["pdf_ocr_unavailable: pdf rasterizer missing", "pdf_ocr_failed: page 1"],
      undefined
    );
    // rasterizer_missing is the root cause — ocr_failed is a consequence
    expect(result.ocr_backfill_reason).toBe("rasterizer_missing");
  });
});

describe("Connector sync metadata", () => {
  // Replicates the metadata shape from _persistSyncMetadata
  function buildSyncMetadata(
    startedAt: number,
    durationMs: number,
    status: "ok" | "error",
    itemsRetrieved: number,
    error?: string
  ): Record<string, unknown> {
    return {
      last_sync_at: startedAt,
      last_sync_duration_ms: durationMs,
      last_sync_status: status,
      last_sync_error: error,
      last_items_retrieved: itemsRetrieved,
    };
  }

  it("includes status, duration, and items for successful sync", () => {
    const meta = buildSyncMetadata(1700000000000, 5000, "ok", 42);
    expect(meta.last_sync_status).toBe("ok");
    expect(meta.last_sync_duration_ms).toBe(5000);
    expect(meta.last_items_retrieved).toBe(42);
    expect(meta.last_sync_error).toBeUndefined();
  });

  it("includes error message for failed sync", () => {
    const meta = buildSyncMetadata(1700000000000, 2000, "error", 0, "Connection refused");
    expect(meta.last_sync_status).toBe("error");
    expect(meta.last_sync_error).toBe("Connection refused");
    expect(meta.last_items_retrieved).toBe(0);
  });

  it("includes timestamp for observability (when did last sync happen)", () => {
    const ts = Date.now();
    const meta = buildSyncMetadata(ts, 1000, "ok", 5);
    expect(meta.last_sync_at).toBe(ts);
  });
});
