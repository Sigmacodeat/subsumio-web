// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  UPLOAD_ACCEPT,
  SUPPORTED_UPLOAD_EXTENSIONS,
  UPLOAD_ACCEPT_ATTRIBUTE,
  SUPPORTED_UPLOAD_MIME_TYPES,
  UPLOAD_FOLDER_ACCEPT_RE,
  uploadExtension,
  isSupportedUploadName,
} from "./upload-formats";

describe("UPLOAD_ACCEPT", () => {
  test("contains pdf and common office formats", () => {
    expect(UPLOAD_ACCEPT["application/pdf"]).toContain(".pdf");
    expect(
      UPLOAD_ACCEPT["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    ).toContain(".docx");
  });

  test("contains image MIME types", () => {
    expect(UPLOAD_ACCEPT["image/png"]).toContain(".png");
    expect(UPLOAD_ACCEPT["image/jpeg"]).toContain(".jpg");
  });
});

describe("SUPPORTED_UPLOAD_EXTENSIONS", () => {
  test("contains all flattened extensions", () => {
    expect(SUPPORTED_UPLOAD_EXTENSIONS.has(".pdf")).toBe(true);
    expect(SUPPORTED_UPLOAD_EXTENSIONS.has(".docx")).toBe(true);
    expect(SUPPORTED_UPLOAD_EXTENSIONS.has(".zip")).toBe(true);
  });

  test("does not contain empty extension", () => {
    expect(SUPPORTED_UPLOAD_EXTENSIONS.has("")).toBe(false);
  });
});

describe("UPLOAD_ACCEPT_ATTRIBUTE", () => {
  test("is a comma-separated list of extensions", () => {
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain(".pdf");
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain(".docx");
    expect(UPLOAD_ACCEPT_ATTRIBUTE.split(",").length).toBeGreaterThan(10);
  });
});

describe("SUPPORTED_UPLOAD_MIME_TYPES", () => {
  test("contains all keys from UPLOAD_ACCEPT plus aliases", () => {
    for (const mime of Object.keys(UPLOAD_ACCEPT)) {
      expect(SUPPORTED_UPLOAD_MIME_TYPES.has(mime)).toBe(true);
    }
    expect(SUPPORTED_UPLOAD_MIME_TYPES.has("text/xml")).toBe(true);
    expect(SUPPORTED_UPLOAD_MIME_TYPES.has("audio/x-wav")).toBe(true);
  });
});

describe("uploadExtension", () => {
  test("extracts lowercase extension", () => {
    expect(uploadExtension("Document.PDF")).toBe(".pdf");
    expect(uploadExtension("file.DOCX")).toBe(".docx");
  });

  test("returns empty string for files without extension", () => {
    expect(uploadExtension("README")).toBe("");
  });

  test("returns last extension only", () => {
    expect(uploadExtension("archive.tar.gz")).toBe(".gz");
  });
});

describe("isSupportedUploadName", () => {
  test("returns true for supported extensions", () => {
    expect(isSupportedUploadName("contract.pdf")).toBe(true);
    expect(isSupportedUploadName("invoice.docx")).toBe(true);
    expect(isSupportedUploadName("image.PNG")).toBe(true);
  });

  test("returns false for unsupported extensions", () => {
    expect(isSupportedUploadName("script.exe")).toBe(false);
    expect(isSupportedUploadName("unknown.xyz")).toBe(false);
  });
});

describe("UPLOAD_FOLDER_ACCEPT_RE", () => {
  test("matches supported file extensions", () => {
    expect(UPLOAD_FOLDER_ACCEPT_RE.test("document.pdf")).toBe(true);
    expect(UPLOAD_FOLDER_ACCEPT_RE.test("archive.zip")).toBe(true);
  });

  test("does not match unsupported extensions", () => {
    expect(UPLOAD_FOLDER_ACCEPT_RE.test("program.exe")).toBe(false);
  });
});
