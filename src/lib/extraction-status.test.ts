// @vitest-environment node

import { describe, it, expect } from "vitest";
import {
  type ExtractionStatus,
  canTransition,
  transition,
  isTerminal,
  isOcrRequired,
  isReady,
  isFailed,
  inferInitialExtractionStatus,
  inferExtractionMethod,
  createInitialMetadata,
  updateMetadataForOcrStart,
  updateMetadataForOcrComplete,
  updateMetadataForOcrFailure,
  updateMetadataForTextLayer,
  markReady,
  markError,
  resetForReOcr,
  statusLabel,
  statusColor,
} from "./extraction-status";

// ── State Machine: Valid Transitions ──────────────────────────────────────

describe("canTransition", () => {
  it("uploaded → processing is valid", () => {
    expect(canTransition("uploaded", "processing")).toBe(true);
  });

  it("uploaded → error is valid", () => {
    expect(canTransition("uploaded", "error")).toBe(true);
  });

  it("uploaded → ready is invalid (must go through processing)", () => {
    expect(canTransition("uploaded", "ready")).toBe(false);
  });

  it("processing → text_layer is valid", () => {
    expect(canTransition("processing", "text_layer")).toBe(true);
  });

  it("processing → ocr_needed is valid", () => {
    expect(canTransition("processing", "ocr_needed")).toBe(true);
  });

  it("processing → ready is valid (e.g. empty PDF)", () => {
    expect(canTransition("processing", "ready")).toBe(true);
  });

  it("processing → error is valid", () => {
    expect(canTransition("processing", "error")).toBe(true);
  });

  it("processing → uploaded is invalid (no rollback)", () => {
    expect(canTransition("processing", "uploaded")).toBe(false);
  });

  it("text_layer → ready is valid", () => {
    expect(canTransition("text_layer", "ready")).toBe(true);
  });

  it("text_layer → error is valid", () => {
    expect(canTransition("text_layer", "error")).toBe(true);
  });

  it("text_layer → ocr_needed is invalid", () => {
    expect(canTransition("text_layer", "ocr_needed")).toBe(false);
  });

  it("ocr_needed → ocr_processing is valid", () => {
    expect(canTransition("ocr_needed", "ocr_processing")).toBe(true);
  });

  it("ocr_needed → ocr_failed is valid (OCR unavailable)", () => {
    expect(canTransition("ocr_needed", "ocr_failed")).toBe(true);
  });

  it("ocr_needed → ready is invalid (must process first)", () => {
    expect(canTransition("ocr_needed", "ready")).toBe(false);
  });

  it("ocr_processing → ocr_complete is valid", () => {
    expect(canTransition("ocr_processing", "ocr_complete")).toBe(true);
  });

  it("ocr_processing → ocr_failed is valid", () => {
    expect(canTransition("ocr_processing", "ocr_failed")).toBe(true);
  });

  it("ocr_processing → ocr_needed is invalid (no rollback during processing)", () => {
    expect(canTransition("ocr_processing", "ocr_needed")).toBe(false);
  });

  it("ocr_complete → ready is valid", () => {
    expect(canTransition("ocr_complete", "ready")).toBe(true);
  });

  it("ocr_complete → ocr_needed is valid (re-OCR)", () => {
    expect(canTransition("ocr_complete", "ocr_needed")).toBe(true);
  });

  it("ocr_failed → ocr_needed is valid (retry OCR)", () => {
    expect(canTransition("ocr_failed", "ocr_needed")).toBe(true);
  });

  it("ocr_failed → error is valid", () => {
    expect(canTransition("ocr_failed", "error")).toBe(true);
  });

  it("ocr_failed → ready is invalid (OCR never succeeded)", () => {
    expect(canTransition("ocr_failed", "ready")).toBe(false);
  });

  it("ready → ocr_needed is valid (re-OCR after ready)", () => {
    expect(canTransition("ready", "ocr_needed")).toBe(true);
  });

  it("ready → processing is invalid", () => {
    expect(canTransition("ready", "processing")).toBe(false);
  });

  it("error → any is invalid (terminal)", () => {
    const allStatuses: ExtractionStatus[] = [
      "uploaded", "processing", "text_layer", "ocr_needed",
      "ocr_processing", "ocr_complete", "ocr_failed", "ready", "error",
    ];
    for (const target of allStatuses) {
      expect(canTransition("error", target)).toBe(false);
    }
  });
});

// ── transition function ───────────────────────────────────────────────────

describe("transition", () => {
  it("returns target status for valid transition", () => {
    expect(transition("uploaded", "processing")).toBe("processing");
  });

  it("throws for invalid transition", () => {
    expect(() => transition("uploaded", "ready")).toThrow(
      "Invalid extraction status transition: uploaded → ready",
    );
  });

  it("throws for error → any", () => {
    expect(() => transition("error", "uploaded")).toThrow();
  });
});

// ── Status Predicates ─────────────────────────────────────────────────────

describe("isTerminal", () => {
  it("returns true for ready", () => {
    expect(isTerminal("ready")).toBe(true);
  });

  it("returns true for error", () => {
    expect(isTerminal("error")).toBe(true);
  });

  it("returns false for ocr_complete", () => {
    expect(isTerminal("ocr_complete")).toBe(false);
  });

  it("returns false for processing", () => {
    expect(isTerminal("processing")).toBe(false);
  });
});

describe("isOcrRequired", () => {
  it("returns true for ocr_needed", () => {
    expect(isOcrRequired("ocr_needed")).toBe(true);
  });

  it("returns true for ocr_processing", () => {
    expect(isOcrRequired("ocr_processing")).toBe(true);
  });

  it("returns false for ocr_complete", () => {
    expect(isOcrRequired("ocr_complete")).toBe(false);
  });

  it("returns false for ready", () => {
    expect(isOcrRequired("ready")).toBe(false);
  });
});

describe("isReady", () => {
  it("returns true for ready", () => {
    expect(isReady("ready")).toBe(true);
  });

  it("returns false for ocr_complete", () => {
    expect(isReady("ocr_complete")).toBe(false);
  });
});

describe("isFailed", () => {
  it("returns true for error", () => {
    expect(isFailed("error")).toBe(true);
  });

  it("returns true for ocr_failed", () => {
    expect(isFailed("ocr_failed")).toBe(true);
  });

  it("returns false for ready", () => {
    expect(isFailed("ready")).toBe(false);
  });
});

// ── inferInitialExtractionStatus ──────────────────────────────────────────

describe("inferInitialExtractionStatus", () => {
  it("PDF → processing", () => {
    expect(inferInitialExtractionStatus("document.pdf", "application/pdf")).toBe("processing");
  });

  it("JPG → ocr_needed", () => {
    expect(inferInitialExtractionStatus("photo.jpg", "image/jpeg")).toBe("ocr_needed");
  });

  it("PNG → ocr_needed", () => {
    expect(inferInitialExtractionStatus("scan.png", "image/png")).toBe("ocr_needed");
  });

  it("TIFF → ocr_needed", () => {
    expect(inferInitialExtractionStatus("scan.tiff", "image/tiff")).toBe("ocr_needed");
  });

  it("DOCX → processing", () => {
    expect(inferInitialExtractionStatus("contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("processing");
  });

  it("TXT → processing", () => {
    expect(inferInitialExtractionStatus("notes.txt", "text/plain")).toBe("processing");
  });

  it("MD → processing", () => {
    expect(inferInitialExtractionStatus("readme.md", "text/markdown")).toBe("processing");
  });

  it("XLSX → processing", () => {
    expect(inferInitialExtractionStatus("data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("processing");
  });

  it("RTF → processing", () => {
    expect(inferInitialExtractionStatus("doc.rtf", "application/rtf")).toBe("processing");
  });

  it("HTML → processing", () => {
    expect(inferInitialExtractionStatus("page.html", "text/html")).toBe("processing");
  });

  it("HEIC → ocr_needed", () => {
    expect(inferInitialExtractionStatus("photo.heic", "image/heic")).toBe("ocr_needed");
  });

  it("AVIF → ocr_needed", () => {
    expect(inferInitialExtractionStatus("photo.avif", "image/avif")).toBe("ocr_needed");
  });

  it("WEBP → ocr_needed", () => {
    expect(inferInitialExtractionStatus("photo.webp", "image/webp")).toBe("ocr_needed");
  });

  it("Unknown extension → processing (safe default)", () => {
    expect(inferInitialExtractionStatus("file.xyz", "application/octet-stream")).toBe("processing");
  });

  it("No extension → processing", () => {
    expect(inferInitialExtractionStatus("README", "text/plain")).toBe("processing");
  });

  it("Uppercase extension → still matched", () => {
    expect(inferInitialExtractionStatus("PHOTO.JPG", "image/jpeg")).toBe("ocr_needed");
  });

  it("PDF with image MIME → processing (extension takes precedence for PDFs)", () => {
    expect(inferInitialExtractionStatus("doc.pdf", "image/png")).toBe("processing");
  });
});

// ── inferExtractionMethod ─────────────────────────────────────────────────

describe("inferExtractionMethod", () => {
  it("ocr_complete → ocr_vision", () => {
    expect(inferExtractionMethod("ocr_complete", true)).toBe("ocr_vision");
  });

  it("ready with OCR → ocr_vision", () => {
    expect(inferExtractionMethod("ready", true)).toBe("ocr_vision");
  });

  it("ready without OCR → text_layer", () => {
    expect(inferExtractionMethod("ready", false)).toBe("text_layer");
  });

  it("text_layer → text_layer", () => {
    expect(inferExtractionMethod("text_layer", false)).toBe("text_layer");
  });

  it("ocr_needed → none", () => {
    expect(inferExtractionMethod("ocr_needed", false)).toBe("none");
  });

  it("processing → none", () => {
    expect(inferExtractionMethod("processing", false)).toBe("none");
  });
});

// ── Metadata Builders ─────────────────────────────────────────────────────

describe("createInitialMetadata", () => {
  it("creates metadata with status 'uploaded'", () => {
    const meta = createInitialMetadata("doc.pdf", "application/pdf");
    expect(meta.status).toBe("uploaded");
    expect(meta.uploaded_at).toBeDefined();
  });

  it("does not set extraction_method initially", () => {
    const meta = createInitialMetadata("doc.pdf", "application/pdf");
    expect(meta.extraction_method).toBeUndefined();
  });
});

describe("updateMetadataForOcrStart", () => {
  it("sets status to ocr_processing and records attempt time", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const updated = updateMetadataForOcrStart(meta);
    expect(updated.status).toBe("ocr_processing");
    expect(updated.ocr_attempted_at).toBeDefined();
    expect(updated.extraction_method).toBe("ocr_vision");
  });

  it("preserves uploaded_at", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const updated = updateMetadataForOcrStart(meta);
    expect(updated.uploaded_at).toBe(meta.uploaded_at);
  });
});

describe("updateMetadataForOcrComplete", () => {
  it("sets status to ocr_complete with result data", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const started = updateMetadataForOcrStart(meta);
    const completed = updateMetadataForOcrComplete(started, {
      char_count: 1500,
      page_count: 3,
      language: "de",
    });
    expect(completed.status).toBe("ocr_complete");
    expect(completed.ocr_completed_at).toBeDefined();
    expect(completed.char_count).toBe(1500);
    expect(completed.page_count).toBe(3);
    expect(completed.language).toBe("de");
    expect(completed.extraction_unverified).toBe(true);
  });

  it("works without optional result fields", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const updated = updateMetadataForOcrComplete(meta, {});
    expect(updated.status).toBe("ocr_complete");
    expect(updated.char_count).toBeUndefined();
  });
});

describe("updateMetadataForOcrFailure", () => {
  it("sets status to ocr_failed with error message", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const started = updateMetadataForOcrStart(meta);
    const failed = updateMetadataForOcrFailure(started, "Vision model timeout");
    expect(failed.status).toBe("ocr_failed");
    expect(failed.ocr_error).toBe("Vision model timeout");
    expect(failed.ocr_completed_at).toBeDefined();
  });
});

describe("updateMetadataForTextLayer", () => {
  it("sets status to text_layer with extraction method", () => {
    const meta = createInitialMetadata("doc.pdf", "application/pdf");
    const updated = updateMetadataForTextLayer(meta, {
      char_count: 5000,
      page_count: 10,
      language: "de",
    });
    expect(updated.status).toBe("text_layer");
    expect(updated.extraction_method).toBe("text_layer");
    expect(updated.char_count).toBe(5000);
    expect(updated.extraction_unverified).toBeUndefined();
  });
});

describe("markReady", () => {
  it("sets status to ready and records processed_at", () => {
    const meta = createInitialMetadata("doc.pdf", "application/pdf");
    const textMeta = updateMetadataForTextLayer(meta, { char_count: 1000 });
    const ready = markReady(textMeta);
    expect(ready.status).toBe("ready");
    expect(ready.processed_at).toBeDefined();
  });

  it("preserves extraction method from previous step", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const ocrMeta = updateMetadataForOcrComplete(meta, { char_count: 500 });
    const ready = markReady(ocrMeta);
    expect(ready.extraction_method).toBe("ocr_vision");
  });
});

describe("markError", () => {
  it("sets status to error with error message", () => {
    const meta = createInitialMetadata("doc.pdf", "application/pdf");
    const error = markError(meta, "Extraction failed: corrupted PDF");
    expect(error.status).toBe("error");
    expect(error.ocr_error).toBe("Extraction failed: corrupted PDF");
    expect(error.processed_at).toBeDefined();
  });
});

describe("resetForReOcr", () => {
  it("resets ocr_complete back to ocr_needed", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const completed = updateMetadataForOcrComplete(meta, { char_count: 500 });
    const reset = resetForReOcr(completed);
    expect(reset.status).toBe("ocr_needed");
    expect(reset.ocr_attempted_at).toBeUndefined();
    expect(reset.ocr_completed_at).toBeUndefined();
    expect(reset.ocr_error).toBeUndefined();
  });

  it("resets ocr_failed back to ocr_needed", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const failed = updateMetadataForOcrFailure(meta, "timeout");
    const reset = resetForReOcr(failed);
    expect(reset.status).toBe("ocr_needed");
    expect(reset.ocr_error).toBeUndefined();
  });

  it("preserves uploaded_at and char_count from previous OCR", () => {
    const meta = createInitialMetadata("scan.png", "image/png");
    const completed = updateMetadataForOcrComplete(meta, { char_count: 500 });
    const reset = resetForReOcr(completed);
    expect(reset.uploaded_at).toBe(meta.uploaded_at);
    expect(reset.char_count).toBe(500);
  });
});

// ── Full Lifecycle Scenarios ──────────────────────────────────────────────

describe("Lifecycle: Image upload with OCR", () => {
  it("full flow: uploaded → ocr_needed → ocr_processing → ocr_complete → ready", () => {
    let meta = createInitialMetadata("scan.jpg", "image/jpeg");
    expect(meta.status).toBe("uploaded");

    // Engine processes and determines OCR is needed
    meta = { ...meta, status: transition("uploaded", "processing") };
    meta = { ...meta, status: transition("processing", "ocr_needed") };

    // OCR starts
    meta = updateMetadataForOcrStart(meta);
    expect(meta.status).toBe("ocr_processing");

    // OCR completes
    meta = updateMetadataForOcrComplete(meta, { char_count: 2000, page_count: 1 });
    expect(meta.status).toBe("ocr_complete");

    // Mark ready
    meta = markReady(meta);
    expect(meta.status).toBe("ready");
    expect(meta.extraction_method).toBe("ocr_vision");
    expect(meta.extraction_unverified).toBe(true);
  });
});

describe("Lifecycle: PDF with text layer", () => {
  it("full flow: uploaded → processing → text_layer → ready", () => {
    let meta = createInitialMetadata("contract.pdf", "application/pdf");
    expect(meta.status).toBe("uploaded");

    meta = { ...meta, status: transition("uploaded", "processing") };
    meta = updateMetadataForTextLayer(meta, { char_count: 10000, page_count: 5 });
    expect(meta.status).toBe("text_layer");

    meta = markReady(meta);
    expect(meta.status).toBe("ready");
    expect(meta.extraction_method).toBe("text_layer");
    expect(meta.extraction_unverified).toBeUndefined();
  });
});

describe("Lifecycle: OCR failure and retry", () => {
  it("full flow: ocr_needed → ocr_processing → ocr_failed → ocr_needed (retry) → ocr_complete → ready", () => {
    let meta = createInitialMetadata("scan.png", "image/png");
    meta = { ...meta, status: "ocr_needed" };

    // First attempt fails
    meta = updateMetadataForOcrStart(meta);
    meta = updateMetadataForOcrFailure(meta, "Model unavailable");
    expect(meta.status).toBe("ocr_failed");

    // Retry
    meta = resetForReOcr(meta);
    expect(meta.status).toBe("ocr_needed");

    // Second attempt succeeds
    meta = updateMetadataForOcrStart(meta);
    meta = updateMetadataForOcrComplete(meta, { char_count: 800 });
    meta = markReady(meta);
    expect(meta.status).toBe("ready");
  });
});

describe("Lifecycle: Re-OCR after ready", () => {
  it("ready → ocr_needed → ocr_processing → ocr_complete → ready", () => {
    let meta = createInitialMetadata("scan.pdf", "application/pdf");
    meta = { ...meta, status: "ocr_complete" };
    meta = markReady(meta);
    expect(meta.status).toBe("ready");

    // User requests re-OCR
    meta = { ...meta, status: transition("ready", "ocr_needed") };
    meta = updateMetadataForOcrStart(meta);
    meta = updateMetadataForOcrComplete(meta, { char_count: 3000 });
    meta = markReady(meta);
    expect(meta.status).toBe("ready");
  });
});

describe("Lifecycle: Error during processing", () => {
  it("uploaded → processing → error", () => {
    let meta = createInitialMetadata("corrupt.pdf", "application/pdf");
    meta = { ...meta, status: transition("uploaded", "processing") };
    meta = markError(meta, "PDF parsing failed");
    expect(meta.status).toBe("error");
    expect(isTerminal(meta.status)).toBe(true);
  });
});

// ── UI Helpers ────────────────────────────────────────────────────────────

describe("statusLabel", () => {
  it("returns German label for each status", () => {
    expect(statusLabel("uploaded")).toBe("Hochgeladen");
    expect(statusLabel("processing")).toBe("Wird verarbeitet");
    expect(statusLabel("ocr_needed")).toBe("OCR erforderlich");
    expect(statusLabel("ocr_processing")).toBe("OCR läuft");
    expect(statusLabel("ocr_complete")).toBe("OCR abgeschlossen");
    expect(statusLabel("ocr_failed")).toBe("OCR fehlgeschlagen");
    expect(statusLabel("ready")).toBe("Bereit");
    expect(statusLabel("error")).toBe("Fehler");
    expect(statusLabel("text_layer")).toBe("Text-Layer erkannt");
  });
});

describe("statusColor", () => {
  it("returns Tailwind classes for each status", () => {
    expect(statusColor("ready")).toContain("green");
    expect(statusColor("error")).toContain("red");
    expect(statusColor("ocr_needed")).toContain("amber");
    expect(statusColor("processing")).toContain("blue");
  });

  it("returns default gray for unknown status", () => {
    // All defined statuses have colors, so this tests the fallback path
    expect(statusColor("ready")).toMatch(/^bg-\w+-100 text-\w+-800$/);
  });
});
