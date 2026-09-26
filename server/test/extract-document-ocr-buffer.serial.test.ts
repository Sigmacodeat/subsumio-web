/**
 * pdf2pic wiring for the scanned-PDF OCR fallback (extract-document.ts).
 *
 * pdf2pic's default responseType is "image": it writes ./untitled.N.png to the
 * working directory and returns a WriteImageResponse WITHOUT a buffer. The OCR
 * loop then never saw an image. This test pins the contract: pages are
 * requested as buffers, the rasterizer keeps the aspect ratio, and the buffer
 * pdf2pic returns is the one handed to generateOcrText.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const convertCalls: Array<{ page: number; opts: unknown }> = [];
let fromBufferOpts: Record<string, unknown> | undefined;
const ocrCalls: Array<{ data: Buffer; mime: string }> = [];
const PAGE_PNG = Buffer.from("PNG-PAGE-BYTES-" + "x".repeat(32));

beforeAll(() => {
  mock.module("pdf2pic", () => ({
    fromBuffer: (_pdf: Buffer, opts: Record<string, unknown>) => {
      fromBufferOpts = opts;
      const convert = async (page: number, callOpts?: { responseType?: string }) => {
        convertCalls.push({ page, opts: callOpts });
        // Faithful to pdf2pic 3.x: only the buffer responseType yields a buffer.
        if (callOpts?.responseType === "buffer") {
          return { buffer: PAGE_PNG, size: "2000x2000", page };
        }
        return { name: `untitled.${page}.png`, path: `./untitled.${page}.png`, page };
      };
      return convert;
    },
  }));
  mock.module("../src/core/ai/gateway.ts", () => ({
    isAvailable: () => true,
    generateOcrText: async (data: Buffer, mime: string) => {
      ocrCalls.push({ data, mime });
      return "Erkannter Scan-Text";
    },
  }));
});

afterAll(() => {
  mock.restore();
});

/** One-page PDF without any text operators — the scanned-document shape. */
function emptyPdfFixture(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
trailer<</Root 1 0 R>>`,
    "latin1"
  );
}

describe("scanned PDF OCR fallback: pdf2pic buffer contract", () => {
  test("requests page buffers with aspect ratio preserved and forwards them to OCR", async () => {
    const { extractDocumentText } = await import("../src/core/extract-document.ts");
    const out = await extractDocumentText(emptyPdfFixture(), ".pdf", { filename: "scan.pdf" });

    // fromBuffer options: no distortion, explicit size.
    expect(fromBufferOpts).toMatchObject({
      density: 300,
      format: "png",
      preserveAspectRatio: true,
    });
    expect(typeof fromBufferOpts?.width).toBe("number");
    expect(typeof fromBufferOpts?.height).toBe("number");

    // Every page conversion asks for a buffer (never the on-disk default).
    expect(convertCalls.length).toBeGreaterThan(0);
    for (const call of convertCalls) {
      expect(call.opts).toEqual({ responseType: "buffer" });
    }

    // The very buffer pdf2pic produced reaches the OCR model.
    expect(ocrCalls.length).toBe(convertCalls.length);
    expect(ocrCalls[0].mime).toBe("image/png");
    expect(ocrCalls[0].data.equals(PAGE_PNG)).toBe(true);

    // And the recognized text lands in the document; no "produced no image".
    expect(out.text).toContain("Erkannter Scan-Text");
    expect(out.warnings.some((w) => w.includes("produced no image"))).toBe(false);
  });
});
