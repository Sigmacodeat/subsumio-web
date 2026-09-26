import { describe, expect, it } from "vitest";
import { checkSignableDocument } from "./docusign-documents";

const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64");

describe("checkSignableDocument", () => {
  it("accepts PDF and DOCX", () => {
    expect(checkSignableDocument(b64("%PDF-1.4 x"))).toEqual({ ok: true, type: "pdf" });
    expect(checkSignableDocument(b64(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1])))).toEqual({
      ok: true,
      type: "docx",
    });
  });
  it("rejects error bodies and bad encoding", () => {
    expect(checkSignableDocument(b64('{"error":"x"}')).ok).toBe(false);
    expect(checkSignableDocument("not base64!").ok).toBe(false);
  });
});
