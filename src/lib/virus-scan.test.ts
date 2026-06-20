// P0-SEC-002: virus-scan gate contract.
// scanFile() is the shared malware/MIME gate used by /api/upload AND the
// WhatsApp media ingestion path. These lock its core detections.

import { describe, expect, it } from "vitest";
import { scanFile } from "@/lib/virus-scan";

function buf(bytes: number[], pad = 0): ArrayBuffer {
  return new Uint8Array([...bytes, ...new Array(pad).fill(0x20)]).buffer;
}

const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF
const PNG = [0x89, 0x50, 0x4e, 0x47]; // PNG
const PE = [0x4d, 0x5a, 0x90, 0x00]; // MZ (Windows PE)
const ELF = [0x7f, 0x45, 0x4c, 0x46]; // ELF
const DOCX = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x06]; // Office Open XML (zip)

describe("scanFile", () => {
  it("accepts a valid PDF declared as application/pdf", async () => {
    const res = await scanFile(buf(PDF, 64), "application/pdf");
    expect(res.ok).toBe(true);
  });

  it("rejects a Windows PE executable even when declared as a PDF", async () => {
    const res = await scanFile(buf(PE, 64), "application/pdf");
    expect(res).toMatchObject({ ok: false, reason: "executable_detected", label: "PE/EXE" });
  });

  it("rejects an ELF binary", async () => {
    const res = await scanFile(buf(ELF, 64), "application/octet-stream");
    expect(res).toMatchObject({ ok: false, reason: "executable_detected", label: "ELF" });
  });

  it("rejects content that does not match the declared MIME type", async () => {
    const res = await scanFile(buf(PNG, 64), "application/pdf");
    expect(res).toMatchObject({ ok: false, reason: "mime_mismatch", expected: "application/pdf" });
  });

  it("allows a DOCX (Office Open XML zip) — not treated as a disguised executable", async () => {
    const res = await scanFile(
      buf(DOCX, 64),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(res.ok).toBe(true);
  });

  it("accepts unknown MIME types without a signature constraint when no executable is present", async () => {
    const res = await scanFile(buf([0x68, 0x65, 0x6c, 0x6c, 0x6f], 16), "text/plain");
    expect(res.ok).toBe(true);
  });
});
