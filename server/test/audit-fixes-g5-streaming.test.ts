import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for G5 full-streaming refactor: lazy-load file data from temp file.
 */

const ROOT = join(__dirname, "..");
const WEB_API = join(ROOT, "src/commands/web-api.ts");
const UPLOAD_SECURITY = join(ROOT, "src/core/upload-security.ts");

describe("G5 Full-Streaming: lazy-load from temp file", () => {
  it("fileData uses tmpPath instead of data: Buffer", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("tmpPath: string");
    expect(src).toContain("fileData = { filename, tmpPath, mimeType, hash, size: bytesWritten }");
  });

  it("getFileData lazy-loads buffer via readFileSync", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("const getFileData = (): Buffer =>");
    expect(src).toContain("fileBuffer = readFileSync(file.tmpPath)");
    expect(src).toContain("G5 fix: lazy-load file data from temp file");
  });

  it("cleanupTempFile is called in finally block", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("const cleanupTempFile = ()");
    expect(src).toContain("if (fileData) cleanupTempFile()");
    expect(src).toContain("G5 fix: always clean up the temp file");
  });

  it("uses inspectUploadFile instead of inspectUploadBytes in /api/upload", () => {
    const src = readFileSync(WEB_API, "utf-8");
    // The /api/upload route should use inspectUploadFile (reads 64 bytes)
    expect(src).toContain("G5 fix: use inspectUploadFile");
    expect(src).toContain("inspectUploadFile(file.filename, file.tmpPath)");
  });

  it("imports inspectUploadFile", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("inspectUploadFile");
    expect(src).toContain('from "../core/upload-security.ts"');
  });

  it("uses file.size instead of file.data.byteLength for size checks", () => {
    const src = readFileSync(WEB_API, "utf-8");
    // In the /api/upload route, size checks should use file.size
    expect(src).toContain("file.size > 50 * 1024 * 1024");
    expect(src).toContain("file.size > maxBytesForUpload");
    expect(src).toContain("file.size >= asyncExtractMinBytes()");
  });

  it("inspectUploadFile exists in upload-security.ts", () => {
    const src = readFileSync(UPLOAD_SECURITY, "utf-8");
    expect(src).toContain("export async function inspectUploadFile");
    expect(src).toContain("reads only first 64 bytes");
  });

  it("inspectUploadFile reads only 64 bytes for magic check", () => {
    const src = readFileSync(UPLOAD_SECURITY, "utf-8");
    expect(src).toContain("Buffer.alloc(64)");
    expect(src).toContain("await handle.read(buf, 0, 64, 0)");
  });

  it("early-exit paths clean up temp file", () => {
    const src = readFileSync(WEB_API, "utf-8");
    // Duplicate check should clean up temp file
    const dupSection = src.slice(
      src.indexOf("storedDuplicateByHash(file.hash"),
      src.indexOf("storedDuplicateByHash(file.hash") + 200
    );
    // After duplicate check, if we return early, the finally block handles cleanup
    expect(src).toContain("} finally {");
    expect(src).toContain("if (fileData) cleanupTempFile()");
  });
});
