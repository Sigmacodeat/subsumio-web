import { describe, expect, test } from "bun:test";
import { inspectUploadBytes } from "../src/core/upload-security.ts";

describe("inspectUploadBytes", () => {
  test("accepts a PDF with matching magic bytes", async () => {
    expect(await inspectUploadBytes("akte.pdf", Buffer.from("%PDF-1.7\n"))).toEqual({ ok: true });
  });

  test("rejects an executable disguised as a document", async () => {
    const result = await inspectUploadBytes("akte.txt", Buffer.from([0x4d, 0x5a, 0, 0]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("executable_detected");
  });

  test("rejects extension/content mismatches", async () => {
    const result = await inspectUploadBytes("akte.pdf", Buffer.from("not a pdf"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("content_type_mismatch");
  });

  test("accepts legacy compound Office files", async () => {
    const result = await inspectUploadBytes(
      "mail.msg",
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0])
    );
    expect(result).toEqual({ ok: true });
  });

  test("validates WebP and audio container markers", async () => {
    const webp = Buffer.alloc(16);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    expect(await inspectUploadBytes("scan.webp", webp)).toEqual({ ok: true });

    const fakeWebp = await inspectUploadBytes("scan.webp", Buffer.from("not-webp"));
    expect(fakeWebp.ok).toBe(false);
    const wav = Buffer.alloc(16);
    wav.write("RIFF", 0, "ascii");
    wav.write("WAVE", 8, "ascii");
    expect(await inspectUploadBytes("hearing.wav", wav)).toEqual({ ok: true });
  });
});
