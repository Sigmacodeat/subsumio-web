import { describe, test, expect } from "vitest";
import { validateUpload, sanitizeFilename, MAX_FILE_SIZE } from "./upload-validation";

describe("validateUpload", () => {
  test("accepts valid PDF", () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const result = validateUpload(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).toBe(file);
  });

  test("accepts valid markdown", () => {
    const file = new File(["# Hello"], "notes.md", { type: "text/markdown" });
    const result = validateUpload(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).toBe(file);
  });

  test("rejects non-File", () => {
    expect(validateUpload(null)).toEqual({ ok: false, error: "file_required" });
    expect(validateUpload("string")).toEqual({ ok: false, error: "file_required" });
    expect(validateUpload({})).toEqual({ ok: false, error: "file_required" });
  });

  test("rejects oversized file", () => {
    const file = new File([new ArrayBuffer(MAX_FILE_SIZE + 1)], "huge.pdf", { type: "application/pdf" });
    const result = validateUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("file_too_large");
      expect(result.maxSize).toBe(MAX_FILE_SIZE);
    }
  });

  test("rejects unsupported MIME type", () => {
    const file = new File(["x"], "image.gif", { type: "image/gif" });
    const result = validateUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unsupported_file_type");
      expect(result.allowed).toContain("application/pdf");
      expect(result.allowed).toContain("text/markdown");
      expect(result.allowed).not.toContain("image/gif");
    }
  });

  test("accepts Word docx", () => {
    const file = new File(["x"], "contract.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const result = validateUpload(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).toBe(file);
  });
});

describe("sanitizeFilename", () => {
  test("preserves safe chars", () => {
    expect(sanitizeFilename("doc_2026.pdf")).toBe("doc_2026.pdf");
  });

  test("replaces special chars with underscore", () => {
    expect(sanitizeFilename("hello world!@#.pdf")).toBe("hello_world_.pdf");
  });

  test("strips leading dots", () => {
    expect(sanitizeFilename("...hidden.pdf")).toBe("hidden.pdf");
  });

  test("collapses multiple underscores", () => {
    expect(sanitizeFilename("a___b___c.pdf")).toBe("a_b_c.pdf");
  });

  test("truncates to 200 chars", () => {
    const long = "a".repeat(300) + ".pdf";
    expect(sanitizeFilename(long).length).toBe(200);
  });

  test("handles umlauts", () => {
    expect(sanitizeFilename("Verträge_ärztlich.pdf")).toBe("Vertr_ge_rztlich.pdf");
  });
});
