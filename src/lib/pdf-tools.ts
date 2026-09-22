import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export class PdfToolError extends Error {}

async function loadDoc(bytes: Uint8Array | ArrayBuffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new PdfToolError("Datei ist kein lesbares PDF (oder passwortgeschützt).");
  }
}

/** Mehrere PDFs der Reihe nach zu einem Dokument zusammenführen. */
export async function mergePdfs(files: Array<Uint8Array | ArrayBuffer>): Promise<Uint8Array> {
  if (files.length === 0) throw new PdfToolError("Keine Dateien zum Zusammenführen.");
  const out = await PDFDocument.create();
  for (const bytes of files) {
    const src = await loadDoc(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}

export interface StampOptions {
  /** Text vor der laufenden Nummer, z. B. "Anlage". */
  label?: string;
  /** Startindex (1-basiert). */
  startIndex?: number;
  /** AZ der Akte, wird in die Stempelzeile aufgenommen. */
  aktenzeichen?: string;
  /** true = „Anlage 1 · Seite 2/5" je Seite; false = nur auf Seite 1. */
  everyPage?: boolean;
}

/**
 * Anlagenstempel: jede Datei bekommt „Anlage <n>" (+ optionales AZ)
 * oben rechts, optional mit Seitenzählung auf jeder Seite.
 * Liefert pro Datei ein gestempeltes PDF zurück.
 */
export async function stampAttachments(
  files: Array<Uint8Array | ArrayBuffer>,
  opts: StampOptions = {}
): Promise<Uint8Array[]> {
  const label = opts.label ?? "Anlage";
  const start = opts.startIndex ?? 1;
  const out: Uint8Array[] = [];

  for (const [i, bytes] of files.entries()) {
    const doc = await loadDoc(bytes);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const anlageNo = start + i;
    const stamp = `${label} ${anlageNo}${opts.aktenzeichen ? ` · ${opts.aktenzeichen}` : ""}`;
    const pages = doc.getPages();
    for (const [pIdx, page] of pages.entries()) {
      if (!opts.everyPage && pIdx > 0) break;
      const { width, height } = page.getSize();
      const line =
        opts.everyPage && pages.length > 1 ? `${stamp} · Seite ${pIdx + 1}/${pages.length}` : stamp;
      const size = 11;
      const textWidth = font.widthOfTextAtSize(line, size);
      page.drawRectangle({
        x: width - textWidth - 30,
        y: height - 34,
        width: textWidth + 16,
        height: 20,
        color: rgb(1, 1, 1),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.8,
      });
      page.drawText(line, {
        x: width - textWidth - 22,
        y: height - 28,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    }
    out.push(await doc.save());
  }
  return out;
}

/** Stempelt und führt direkt zu einer gebündelten Anlagen-PDF zusammen. */
export async function mergeStampedAttachments(
  files: Array<Uint8Array | ArrayBuffer>,
  opts: StampOptions = {}
): Promise<Uint8Array> {
  const stamped = await stampAttachments(files, { ...opts, everyPage: true });
  return mergePdfs(stamped);
}
