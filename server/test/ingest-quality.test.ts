import { describe, it, expect, afterEach } from "bun:test";
import { createServer, type Server } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  correctLegalOcr,
  pageImagePpi,
  renderDpiFor,
  textFromTesseractTsv,
} from "../src/core/ocr/local-ocr.ts";
import { configuredOcrEngine } from "../src/core/ocr/recognize.ts";
import {
  extractDocumentText,
  htmlToText,
  isUnreliableTextLayer,
  rtfToText,
} from "../src/core/extract-document.ts";
import { classifyLegalDocument } from "../src/core/legal/doc-classifier.ts";
import { cleanPassage, locateChunkPages } from "../src/core/citation-provenance.ts";
import { renderPagesBlock } from "../src/core/think/gather.ts";
import { inspectUploadFile } from "../src/core/upload-security.ts";
import type { SearchResult } from "../src/core/types.ts";

/**
 * Document-ingest quality: OCR routing and post-correction, broken text
 * layers, word-processor formats, e-mail HTML, classification, citation
 * pages, prompt excerpts and the streamed virus scan.
 */

describe("OCR § post-correction", () => {
  it("repairs misread § in front of a norm citation", () => {
    expect(correctLegalOcr("gemäß 8 1295 ABGB haftet")).toBe("gemäß § 1295 ABGB haftet");
    expect(correctLegalOcr("nach $ 7 Abs 2 AVG")).toBe("nach § 7 Abs 2 AVG");
    expect(correctLegalOcr("iSd 88 12 ff ZPO")).toBe("iSd 88 12 ff ZPO");
    expect(correctLegalOcr("iSd 88 12 ZPO")).toBe("iSd §§ 12 ZPO");
    expect(correctLegalOcr("§ 49 Abs 1 JN")).toBe("§ 49 Abs 1 JN");
  });

  it("leaves senates, amounts and counts alone", () => {
    expect(correctLegalOcr("OGH 8 Ob 12/24x")).toBe("OGH 8 Ob 12/24x");
    expect(correctLegalOcr("Betrag 8 500 EUR")).toBe("Betrag 8 500 EUR");
    expect(correctLegalOcr("$ 5.000 Honorar")).toBe("$ 5.000 Honorar");
    expect(correctLegalOcr("8 Seiten Beilagen")).toBe("8 Seiten Beilagen");
  });
});

describe("Tesseract TSV → text", () => {
  const header =
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const word = (page: number, par: number, line: number, n: number, conf: number, text: string) =>
    `5\t${page}\t1\t${par}\t${line}\t${n}\t0\t0\t0\t0\t${conf}\t${text}`;

  it("keeps lines and paragraphs and weights confidence by word length", () => {
    const tsv = [
      header,
      word(1, 1, 1, 1, 90, "Klage"),
      word(1, 1, 2, 1, 80, "wegen"),
      word(1, 1, 2, 2, 80, "EUR"),
      word(1, 2, 1, 1, 70, "Beweis:"),
    ].join("\n");
    const result = textFromTesseractTsv(tsv);
    expect(result.text).toBe("Klage\nwegen EUR\n\nBeweis:");
    expect(result.confidence).toBeCloseTo((90 * 5 + 80 * 5 + 80 * 3 + 70 * 7) / 20, 1);
  });

  it("marks every page of a multi-page TIFF", () => {
    const tsv = [header, word(1, 1, 1, 1, 90, "Seite"), word(2, 1, 1, 1, 90, "Zwei")].join("\n");
    expect(textFromTesseractTsv(tsv).text).toBe("--- Page 1 ---\nSeite\n\n--- Page 2 ---\nZwei");
  });

  it("returns null confidence when nothing was recognized", () => {
    expect(textFromTesseractTsv(header).confidence).toBeNull();
  });
});

describe("OCR render resolution", () => {
  it("renders at the scan's own resolution, clamped", () => {
    const listing = [
      "page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio",
      "--------------------------------------------------------------------------------------------",
      "   1     0 image    1654  2339  icc     1   8  jpeg   no         5  0   200   200  368K 9.7%",
    ].join("\n");
    expect(pageImagePpi(listing)).toBe(200);
    expect(renderDpiFor(200)).toBe(200);
    expect(renderDpiFor(72)).toBe(150);
    expect(renderDpiFor(600)).toBe(400);
    expect(renderDpiFor(null)).toBe(300);
  });

  it("defaults to auto and accepts local/vision", () => {
    expect(configuredOcrEngine(undefined)).toBe("auto");
    expect(configuredOcrEngine("LOCAL")).toBe("local");
    expect(configuredOcrEngine("vision")).toBe("vision");
    expect(configuredOcrEngine("bogus")).toBe("auto");
  });
});

describe("unreliable PDF text layers", () => {
  const prose =
    "Die beklagte Partei ist schuldig, der klagenden Partei EUR 12.345,67 samt 9,2 % Zinsen " +
    "seit 17.06.2025 binnen 14 Tagen zu bezahlen. Begründung: Gemäß § 1170b ABGB";

  it("keeps real prose and number tables", () => {
    expect(isUnreliableTextLayer(prose)).toBe(false);
    expect(
      isUnreliableTextLayer("TP 3A 1.234,50 20 % 246,90 TP 2 559,00 ES 50 % 279,50 Summe 2.320,00")
    ).toBe(false);
  });

  it("flags empty pages, glyph garbage and letter-fragment OCR layers", () => {
    expect(isUnreliableTextLayer("  ")).toBe(true);
    expect(
      isUnreliableTextLayer(`${prose}`.replace(/[äöüß§]/g, "�").repeat(1) + "�".repeat(20))
    ).toBe(true);
    expect(
      isUnreliableTextLayer(
        "Kl a g e B e z i r k s g e r i c h t ln n e r e S t a d t W i e n E U R 1 2 . 3 4 5"
      )
    ).toBe(true);
  });

  it("no longer deletes U+FFFD or invents umlauts", async () => {
    const eml = Buffer.from(
      "From: a@example.com\r\nTo: b@example.com\r\nSubject: Test\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n\r\n" +
        "Herr H he, Fr ha, X�Y. GemÃ¤ÃŸ\r\n",
      "utf8"
    );
    const extracted = await extractDocumentText(eml, ".eml");
    expect(extracted.text).toContain("Herr H he, Fr ha");
    expect(extracted.text).toContain("X�Y");
    // Unambiguous mojibake is still repaired.
    expect(extracted.text).toContain("Gemäß");
  });
});

describe("RTF fallback parser", () => {
  it("drops font/style tables and honours \\uc skips", () => {
    const rtf =
      "{\\rtf1\\ansi{\\fonttbl{\\f0 Times New Roman;}}{\\stylesheet{\\s0 Normal;}}" +
      "{\\*\\generator LibreOffice;}\\uc1 M\\u252\\'fcller gem\\u228\\'e4\\u223\\'df " +
      "\\u167\\'a7 1295 ABGB\\par}";
    const text = rtfToText(rtf);
    expect(text).not.toContain("Times New Roman");
    expect(text).not.toContain("Normal");
    expect(text).not.toContain("LibreOffice");
    expect(text.trim()).toBe("Müller gemäß § 1295 ABGB");
  });

  it("leaves tracked deletions out of the body", () => {
    const rtf = "{\\rtf1 Klage ist {\\deleted nicht }berechtigt.\\par}";
    expect(rtfToText(rtf).trim()).toBe("Klage ist berechtigt.");
  });
});

describe("HTML e-mail bodies", () => {
  it("decodes entities and keeps structure", () => {
    const html =
      "<html><head><title>x</title></head><body><p>Gem&auml;&szlig; &sect; 1380 ABGB</p>" +
      "<p>Betrag EUR 5.000,&ndash;</p><table><tr><td>A</td><td>B</td></tr></table></body></html>";
    const text = htmlToText(html);
    expect(text).toContain("Gemäß § 1380 ABGB");
    expect(text).toContain("5.000,–");
    expect(text).toContain("A\tB");
    expect(text).not.toContain("&");
  });
});

describe("document classifier", () => {
  it("does not read a Klage or a contract as an invoice", () => {
    const klage =
      "An das Bezirksgericht Innere Stadt Wien\nKlagende Partei: A GmbH\nBeklagte Partei: B\n" +
      "wegen EUR 12.345,67 s.A.\nKLAGE\nI. Sachverhalt: Die Leistung wurde erbracht; der Betrag " +
      "ist netto geöffnet ausgewiesen.\nBeweis: Rechnung Nr. 2025-0815\nII. Klagebegehren\n" +
      "Die klagende Partei stellt den Antrag, das Gericht möge ...";
    expect(classifyLegalDocument(klage).type).toBe("pleading");
    const invoice =
      "Rechnung Nr. 2026-117\nRechnungsdatum 01.09.2026\nLeistung Beratung\nNetto EUR 900,00\n" +
      "Umsatzsteuer EUR 180,00\nBrutto EUR 1.080,00\nIBAN AT12";
    expect(classifyLegalDocument(invoice).type).toBe("invoice");
  });

  it("recognizes an Austrian judgment", () => {
    const urteil =
      "IM NAMEN DER REPUBLIK\nDas Landesgericht hat durch den Richter in der Rechtssache " +
      "zu Recht erkannt:\nDie beklagte Partei ist schuldig ...\nEntscheidungsgründe:\n...";
    expect(classifyLegalDocument(urteil).type).toBe("court_judgment");
  });
});

describe("citation page provenance", () => {
  const doc = [
    "--- Page 1 ---",
    "Rubrum. § 3 Haftung: Der Auftragnehmer haftet nur für Vorsatz und grobe Fahrlässigkeit.",
    "###***###",
    "--- Page 2 ---",
    "Anlagen und Verzeichnis ohne Inhalt.",
    "###***###",
    "--- Page 3 ---",
    "§ 9 Haftung: Der Auftragnehmer haftet nur für Vorsatz und grobe Fahrlässigkeit, " +
      "ausgenommen Personenschäden nach dem Produkthaftungsgesetz.",
    "###***###",
    "--- Page 4 ---",
    "Schlussbestimmungen.",
  ].join("\n");

  it("places a repeated clause on its own page", () => {
    const chunk =
      "Der Auftragnehmer haftet nur für Vorsatz und grobe Fahrlässigkeit, ausgenommen Personenschäden";
    expect(locateChunkPages(doc, chunk)?.page).toBe(3);
  });

  it("reports the page range of a chunk spanning pages", () => {
    const chunk =
      "ausgenommen Personenschäden nach dem Produkthaftungsgesetz.\n###***###\n--- Page 4 ---\nSchlussbestimmungen.";
    const located = locateChunkPages(doc, chunk);
    expect(located?.page).toBe(3);
    expect(located?.pageEnd).toBe(4);
  });

  it("returns null without page markers and cleans quotes", () => {
    expect(
      locateChunkPages("plain text without markers at all here", "plain text without markers")
    ).toBeNull();
    expect(cleanPassage("--- Page 2 ---\n[OCR-Seite · Erkennungssicherheit 91 %]\nText")).toBe(
      "Text"
    );
  });
});

describe("prompt excerpts", () => {
  const page = (slug: string, length: number) =>
    ({ slug, chunk_text: "x".repeat(length) }) as unknown as SearchResult;

  it("shows a whole chunk instead of 600 chars", () => {
    const block = renderPagesBlock([page("a", 3500)]);
    expect(block).toContain("x".repeat(3500));
  });

  it("spends a total budget best-first", () => {
    const block = renderPagesBlock([page("a", 4000), page("b", 4000), page("c", 4000)], 4000, 6000);
    const lengths = [...block.matchAll(/>\n(x+)\n<\/page>/g)].map((m) => m[1].length);
    expect(lengths).toEqual([4000, 2000, 300]);
  });
});

describe("virus scan of uploads on disk", () => {
  let server: Server | undefined;
  let dir: string | undefined;
  const previousHost = process.env.CLAMAV_HOST;

  afterEach(() => {
    server?.close();
    server = undefined;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
    if (previousHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = previousHost;
  });

  /** Minimal clamd: accepts only INSTREAM, flags the EICAR marker. */
  async function fakeClamd(): Promise<{ port: number; commands: string[] }> {
    const commands: string[] = [];
    server = createServer((socket) => {
      let buffer = Buffer.alloc(0);
      let body = Buffer.alloc(0);
      let command: string | null = null;
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (command === null) {
          const end = buffer.indexOf(0);
          if (end === -1) return;
          command = buffer.subarray(0, end).toString();
          commands.push(command);
          buffer = buffer.subarray(end + 1);
          if (command !== "zINSTREAM") {
            socket.end("/tmp/x: lstat() failed: No such file or directory. ERROR\0");
            return;
          }
        }
        while (buffer.length >= 4) {
          const length = buffer.readUInt32BE(0);
          if (length === 0) {
            socket.end(
              body.includes("EICAR-TEST") ? "stream: Eicar-Signature FOUND\0" : "stream: OK\0"
            );
            return;
          }
          if (buffer.length < 4 + length) return;
          body = Buffer.concat([body, buffer.subarray(4, 4 + length)]);
          buffer = buffer.subarray(4 + length);
        }
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    return { port: typeof address === "object" && address ? address.port : 0, commands };
  }

  it("streams the file (INSTREAM) instead of sending a path clamd cannot see", async () => {
    const { port, commands } = await fakeClamd();
    process.env.CLAMAV_HOST = `127.0.0.1:${port}`;
    dir = mkdtempSync(join(tmpdir(), "ingest-quality-"));
    const clean = join(dir, "notiz.txt");
    writeFileSync(clean, "Aktennotiz ".repeat(20_000));
    expect(await inspectUploadFile("notiz.txt", clean)).toEqual({ ok: true });
    expect(commands).toEqual(["zINSTREAM"]);

    const infected = join(dir, "virus.txt");
    writeFileSync(infected, "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-TEST-FILE!$H+H*");
    const result = await inspectUploadFile("virus.txt", infected);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("malware_detected");
  });
});
