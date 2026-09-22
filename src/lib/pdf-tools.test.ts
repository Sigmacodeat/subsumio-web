import { describe, expect, test } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePdfs, mergeStampedAttachments, PdfToolError, stampAttachments } from "./pdf-tools";

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 600]);
  return doc.save();
}

describe("mergePdfs", () => {
  test("fügt Seiten aller Dateien in Reihenfolge zusammen", async () => {
    const merged = await mergePdfs([await makePdf(2), await makePdf(3)]);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(5);
  });

  test("wirft bei leerer Liste und bei Nicht-PDFs", async () => {
    await expect(mergePdfs([])).rejects.toThrow(PdfToolError);
    await expect(mergePdfs([new TextEncoder().encode("kein pdf")])).rejects.toThrow(PdfToolError);
  });
});

describe("stampAttachments", () => {
  test("stempelt jede Datei mit laufender Anlagennummer", async () => {
    const stamped = await stampAttachments([await makePdf(1), await makePdf(1)], {
      aktenzeichen: "MUSTER-26-0042",
    });
    expect(stamped).toHaveLength(2);
    for (const bytes of stamped) {
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  test("everyPage stempelt alle Seiten, sonst nur Seite 1", async () => {
    const [one] = await stampAttachments([await makePdf(3)], { everyPage: true });
    expect(await PDFDocument.load(one!).then((d) => d.getPageCount())).toBe(3);
  });

  test("startIndex versetzt die Nummerierung", async () => {
    const stamped = await stampAttachments([await makePdf(1)], { startIndex: 5 });
    expect(await PDFDocument.load(stamped[0]!)).toBeTruthy();
  });
});

describe("mergeStampedAttachments", () => {
  test("erzeugt eine gebündelte Anlagen-PDF", async () => {
    const out = await mergeStampedAttachments([await makePdf(2), await makePdf(1)]);
    expect(await PDFDocument.load(out).then((d) => d.getPageCount())).toBe(3);
  });
});
