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
    // Fake the size rather than allocating MAX_FILE_SIZE of real memory.
    const file = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE + 1 });
    const result = validateUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("file_too_large");
      expect(result.maxSize).toBe(MAX_FILE_SIZE);
    }
  });

  test("accepts a large document up to the 500 MB limit", () => {
    const file = new File(["x"], "scan.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE });
    expect(MAX_FILE_SIZE).toBe(500 * 1024 * 1024);
    const result = validateUpload(file);
    expect(result.ok).toBe(true);
  });

  test("enforces the 20 MB tabular limit", () => {
    const file = new File(["x"], "evidence.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    Object.defineProperty(file, "size", { value: 20 * 1024 * 1024 + 1 });
    const result = validateUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.maxSize).toBe(20 * 1024 * 1024);
  });

  test("rejects unsupported MIME type", () => {
    const file = new File(["x"], "payload.exe", { type: "application/x-msdownload" });
    const result = validateUpload(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unsupported_file_type");
      expect(result.allowed).toContain("application/pdf");
      expect(result.allowed).toContain("text/markdown");
      expect(result.allowed).not.toContain("application/x-msdownload");
    }
  });

  test("accepts Word docx", () => {
    const file = new File(["x"], "contract.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const result = validateUpload(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).toBe(file);
  });

  test.each([
    ["akte.zip", "application/zip"],
    ["mail.msg", "application/octet-stream"],
    ["archive.pst", "application/vnd.ms-outlook"],
    ["contract.docm", "application/vnd.ms-word.document.macroEnabled.12"],
    ["evidence.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
    ["hearing.pptm", "application/vnd.ms-powerpoint.presentation.macroEnabled.12"],
    ["table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["brief.pages", "application/vnd.apple.pages"],
    ["recording.mp3", "audio/mpeg"],
  ])("accepts supported legal-office format %s", (name, type) => {
    expect(validateUpload(new File(["x"], name, { type })).ok).toBe(true);
  });

  test("rejects a known MIME hidden behind an unsupported extension", () => {
    expect(validateUpload(new File(["x"], "payload.exe", { type: "application/pdf" })).ok).toBe(
      false
    );
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
