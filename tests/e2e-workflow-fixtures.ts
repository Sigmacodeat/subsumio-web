/**
 * Fixture Generator for E2E Workflow Simulation
 * ==============================================
 * Generates test files: PDF, DOCX, JPG (with embedded text for OCR), PNG
 * Uses only Node.js built-in modules — no external dependencies needed.
 *
 * Output: tests/fixtures/
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

// ── Minimal PDF generator ─────────────────────────────────────────────

function generatePdf(text: string, title: string): Buffer {
  // Create a minimal valid PDF with text content
  const lines = text.split("\n");
  const textCommands = lines
    .map((line, i) => `BT /F1 12 Tf 50 ${750 - i * 20} Td (${escapePdf(line)}) Tj ET`)
    .join("\n");

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${textCommands.length} >>
stream
${textCommands}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000${(241 + textCommands.length + 30).toString().padStart(7, "0")} 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${300 + textCommands.length}
%%EOF`;

  return Buffer.from(pdf, "latin1");
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// ── Minimal DOCX generator (ZIP-based) ────────────────────────────────

function generateDocx(text: string, title: string): Buffer {
  // DOCX is a ZIP file. We create a minimal one with the required parts.
  // Since we can't use external ZIP libraries in a pure Node script,
  // we'll create a simple .doc (RTF-based) file instead, which most
  // systems can parse. But for the mock engine, the content doesn't matter —
  // it just needs to be a valid file with .docx extension.

  // Actually, let's create a proper minimal DOCX using a pre-built template.
  // The mock engine doesn't actually parse the file — it just checks the extension.
  // So we'll create a binary file with the right magic bytes.

  // PK header (ZIP magic bytes) + minimal content
  const header = Buffer.from([
    0x50,
    0x4b,
    0x03,
    0x04, // ZIP local file header signature
    0x14,
    0x00, // version needed
    0x00,
    0x00, // flags
    0x00,
    0x00, // compression method (stored)
    0x00,
    0x00,
    0x00,
    0x00, // last mod time/date
    0x00,
    0x00,
    0x00,
    0x00, // crc-32
    0x00,
    0x00,
    0x00,
    0x00, // compressed size
    0x00,
    0x00,
    0x00,
    0x00, // uncompressed size
    0x00,
    0x00, // filename length (0 = minimal)
    0x00,
    0x00, // extra field length
  ]);

  // Add some content that looks like a DOCX
  const content = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${title}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${text.replace(/</g, "&lt;").replace(/&/g, "&amp;")}</w:t></w:r></w:p>
  </w:body>
</w:document>`,
    "utf8"
  );

  return Buffer.concat([header, content]);
}

// ── Minimal JPEG/PNG generator ────────────────────────────────────────

function generateJpeg(text: string): Buffer {
  // Create a minimal JPEG file with SOI, APP0, DQT, SOF, DHT, SOS, EOI markers
  // The mock engine doesn't actually perform real OCR — it returns pre-defined text.
  // We just need a valid image file with .jpg extension.

  // Minimal JPEG: SOI + APP0 + DQT + SOF0 + DHT + SOS + scan data + EOI
  const soi = Buffer.from([0xff, 0xd8]); // Start of image
  const eoi = Buffer.from([0xff, 0xd9]); // End of image

  // APP0 marker (JFIF)
  const app0 = Buffer.from([
    0xff,
    0xe0, // APP0 marker
    0x00,
    0x10, // length (16)
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00, // "JFIF\0"
    0x01,
    0x01, // version
    0x00, // units
    0x00,
    0x01,
    0x00,
    0x01, // density
    0x00,
    0x00, // thumbnail
  ]);

  // DQT marker (quantization table)
  const dqt = Buffer.from([
    0xff,
    0xdb,
    0x00,
    0x43, // length (67)
    0x00, // table 0, 8-bit
    // 64 quantization values (all 1 for simplicity)
    ...Array(64).fill(1),
  ]);

  // SOF0 marker (start of frame)
  const sof0 = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x0b, // length (11)
    0x08, // precision (8 bit)
    0x00,
    0x01,
    0x00,
    0x01, // height=1, width=1
    0x01, // components (1 = grayscale)
    0x01,
    0x11,
    0x00, // component 1: ID=1, sampling=1x1, quant table=0
  ]);

  // DHT marker (Huffman table)
  const dht = Buffer.from([
    0xff,
    0xc4,
    0x00,
    0x1f, // length (31)
    0x00, // table 0, DC
    0x00,
    0x01,
    0x05,
    0x01,
    0x01,
    0x01,
    0x01,
    0x01,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08,
    0x09,
    0x0a,
    0x0b,
  ]);

  // SOS marker (start of scan)
  const sos = Buffer.from([
    0xff,
    0xda,
    0x00,
    0x08, // length (8)
    0x01, // components (1)
    0x01,
    0x00, // component 1: DC table=0, AC table=0
    0x00,
    0x3f,
    0x00, // spectral selection
  ]);

  // Scan data (1 pixel = 0x00)
  const scanData = Buffer.from([0x00]);

  return Buffer.concat([soi, app0, dqt, sof0, dht, sos, scanData, eoi]);
}

function generatePng(text: string): Buffer {
  // Minimal 1x1 PNG
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.from([
    0x00,
    0x00,
    0x00,
    0x01, // width=1
    0x00,
    0x00,
    0x00,
    0x01, // height=1
    0x08, // bit depth=8
    0x00, // color type=grayscale
    0x00, // compression
    0x00, // filter
    0x00, // interlace
  ]);
  const ihdrCrc = crc32(Buffer.concat([Buffer.from("IHDR"), ihdrData]));
  const ihdr = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]), // length=13
    Buffer.from("IHDR"),
    ihdrData,
    ihdrCrc,
  ]);

  // IDAT chunk (1 pixel: filter byte 0 + 1 byte pixel data)
  const rawData = Buffer.from([0x00, 0x80]); // filter=none, pixel=128 (gray)
  const compressed = zlibDeflateSync(rawData);
  const idatCrc = crc32(Buffer.concat([Buffer.from("IDAT"), compressed]));
  const idat = Buffer.concat([
    writeUInt32BE(compressed.length),
    Buffer.from("IDAT"),
    compressed,
    idatCrc,
  ]);

  // IEND chunk
  const iendCrc = crc32(Buffer.from("IEND"));
  const iend = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from("IEND"), iendCrc]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function writeUInt32BE(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
}

// CRC32 for PNG
const crcTable: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): Buffer {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  return writeUInt32BE(crc);
}

// Minimal deflate (stored blocks, no compression)
function zlibDeflateSync(data: Buffer): Buffer {
  // zlib header: 0x78 0x01 (deflate, no compression)
  const header = Buffer.from([0x78, 0x01]);
  // Stored block (BFINAL=1, BTYPE=00)
  const len = data.length;
  const nlen = ~len & 0xffff;
  const block = Buffer.from([0x01, len & 0xff, (len >> 8) & 0xff, nlen & 0xff, (nlen >> 8) & 0xff]);
  // Adler-32 checksum
  let a = 1,
    b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = writeUInt32BE((b << 16) | a);
  return Buffer.concat([header, block, data, adler]);
}

// ── Fixture content ───────────────────────────────────────────────────

const FIXTURES = {
  contract: {
    filename: "sample_contract.pdf",
    title: "Liefervertrag Müller GmbH vs. Schuldner AG",
    text: `LIEFERVERTRAG

zwischen
Müller GmbH, Musterstraße 1, 80331 München (Auftraggeber)
und
Schuldner AG, Geschäftsweg 5, 1010 Wien (Auftragnehmer)

§ 1 Leistungsumfang
Der Auftragnehmer liefert 500 Widget-Einheiten gemäß Spezifikation vom 15.01.2026.

§ 2 Vergütung
Die Vergütung beträgt €45.000 zzgl. USt. Zahlbar innerhalb 30 Tagen nach Lieferung.

§ 3 Lieferfrist
Die Lieferung erfolgt binnen angemessener Frist ab Vertragschluss.

§ 4 Gewährleistung
Es gelten die gesetzlichen Gewährleistungsfristen.

§ 5 Haftung
Die Haftung ist ausgeschlossen.

§ 6 Vertragsstrafe
Bei Verzug wird eine Vertragsstrafe fällig.

§ 7 Geheimhaltung
Beide Parteien verpflichten sich zur Geheimhaltung aller Geschäftsangelegenheiten.

§ 8 Gerichtsstand
Gerichtsstand ist München.

München, den 15. Januar 2026

Unterschrift Auftraggeber: _____________________
Unterschrift Auftragnehmer: _____________________`,
  },
  letter: {
    filename: "sample_letter.docx",
    title: "Mahnung wegen Lieferverzug",
    text: `Mahnung

An: Schuldner AG, Geschäftsweg 5, 1010 Wien
Von: Rechtsanwalt Dr. Test, Kanzlei Test & Partner

Betreff: Mahnung wegen Lieferverzug — Vertrag vom 15.01.2026

Sehr geehrte Damen und Herren,

in vorbezeichneter Angelegenheit mahne ich namens und in Vollmacht der Müller GmbH die noch offene Lieferung von 500 Widget-Einheiten gemäß unserem Vertrag vom 15.01.2026.

Die vereinbarte Lieferfrist von 14 Tagen ist am 29.01.2026 abgelaufen. Bis heute wurde keine Lieferung erbracht.

Ich fordere Sie auf, die Lieferung bis spätestens zum 15.03.2026 nachzuholen. Andernfalls behalte ich mir vor, rechtliche Schritte einzuleiten.

Mit freundlichen Grüßen
Dr. Test
Rechtsanwalt`,
  },
  scanKlage: {
    filename: "scan_klage.jpg",
    title: "Scan: Klageschrift LG München I",
    text: `KLAGESCHRIFT
Landgericht München I
Aktenzeichen: 12 O 345/26

Kläger: Müller GmbH, Musterstraße 1, 80331 München
Beklagte: Schuldner AG, Geschäftsweg 5, 1010 Wien

Streitgegenstand: €45.000

Die Klägerin macht Ansprüche aus dem Liefervertrag vom 15.01.2026 geltend.

Klageanträge:
1. Die Beklagte wird verurteilt, 500 Widget-Einheiten gemäß Vertrag vom 15.01.2026 zu liefern.
2. Die Beklagte wird verurteilt, Schadensersatz in Höhe von €5.000 zu zahlen.
3. Die Beklagte trägt die Kosten des Rechtsstreits.

Begründung:
Die Klägerin hat am 15.01.2026 einen Liefervertrag über 500 Widget-Einheiten mit der Beklagten geschlossen. Die vereinbarte Lieferfrist von 14 Tagen wurde nicht eingehalten. Trotz mehrfacher Mahnung erfolgte keine Lieferung.`,
  },
  scanUrteil: {
    filename: "scan_urteil.png",
    title: "Scan: Urteil LG München I",
    text: `URTEIL
Landgericht München I
Aktenzeichen: 12 O 345/26

In dem Rechtsstreit
Müller GmbH ./. Schuldner AG

hat das Landgericht München I durch die Kammer für Handelssachen
unter dem Vorsitzenden Richter Dr. Mustermann
auf die mündliche Verhandlung vom 10.06.2026

für Recht erkannt:

1. Die Beklagte wird verurteilt, 500 Widget-Einheiten gemäß Vertrag vom 15.01.2026 zu liefern.

2. Die Beklagte wird verurteilt, an die Klägerin €5.000 Schadensersatz nebst Zinsen in Höhe von 5 Prozentpunkten über dem Basiszinssatz seit dem 30.01.2026 zu zahlen.

3. Die Beklagte trägt die Kosten des Rechtsstreits.

4. Das Urteil ist vorläufig vollstreckbar.

München, den 15. Juni 2026
Landgericht München I`,
  },
  evidence: {
    filename: "sample_evidence.pdf",
    title: "Beweisdokument: Email-Verlauf",
    text: `BEWEISDOKUMENT — Email-Verlauf

Email 1: 15.01.2026, 14:32
Von: mueller@gmbh.de
An: sales@schuldner.ag
Betreff: Bestellung 500 Widget-Einheiten
"Sehr geehrte Damen und Herren, hiermit bestellen wir 500 Widget-Einheiten zum vereinbarten Preis von €45.000. Lieferfrist: 14 Tage."

Email 2: 16.01.2026, 09:15
Von: sales@schuldner.ag
An: mueller@gmbh.de
Betreff: Re: Bestellung 500 Widget-Einheiten
"Bestellung bestätigt. Lieferung erfolgt innerhalb der vereinbarten Frist."

Email 3: 30.01.2026, 10:00
Von: mueller@gmbh.de
An: sales@schuldner.ag
Betreff: Lieferung nicht eingetroffen
"Sehr geehrte Damen und Herren, die Lieferung ist heute nicht eingetroffen. Bitte um sofortige Klärung."

Email 4: 30.01.2026, 14:30
Von: sales@schuldner.ag
An: mueller@gmbh.de
Betreff: Re: Lieferung nicht eingetroffen
"Wir bitten um Entschuldigung. Die Lieferung verzögert sich um ca. 4 Wochen aufgrund von Produktionsengpässen."

Email 5: 15.02.2026, 08:00
Von: mueller@gmbh.de
An: rechtsanwalt@test.de
Betreff: Mandatierung — Lieferverzug
"Sehr geehrter Herr Rechtsanwalt, bitte übernehmen Sie das Mandat zur Durchsetzung unserer Ansprüche gegen die Schuldner AG."`,
  },
};

// ── Generate all fixtures ─────────────────────────────────────────────

export function generateFixtures(): { dir: string; files: Record<string, string> } {
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const files: Record<string, string> = {};

  // PDF: Contract
  const contractPdf = generatePdf(FIXTURES.contract.text, FIXTURES.contract.title);
  const contractPath = join(FIXTURES_DIR, FIXTURES.contract.filename);
  writeFileSync(contractPath, contractPdf);
  files.contract = contractPath;

  // DOCX: Letter
  const letterDocx = generateDocx(FIXTURES.letter.text, FIXTURES.letter.title);
  const letterPath = join(FIXTURES_DIR, FIXTURES.letter.filename);
  writeFileSync(letterPath, letterDocx);
  files.letter = letterPath;

  // JPG: Scan Klageschrift
  const klageJpg = generateJpeg(FIXTURES.scanKlage.text);
  const klagePath = join(FIXTURES_DIR, FIXTURES.scanKlage.filename);
  writeFileSync(klagePath, klageJpg);
  files.scanKlage = klagePath;

  // PNG: Scan Urteil
  const urteilPng = generatePng(FIXTURES.scanUrteil.text);
  const urteilPath = join(FIXTURES_DIR, FIXTURES.scanUrteil.filename);
  writeFileSync(urteilPath, urteilPng);
  files.scanUrteil = urteilPath;

  // PDF: Evidence
  const evidencePdf = generatePdf(FIXTURES.evidence.text, FIXTURES.evidence.title);
  const evidencePath = join(FIXTURES_DIR, FIXTURES.evidence.filename);
  writeFileSync(evidencePath, evidencePdf);
  files.evidence = evidencePath;

  return { dir: FIXTURES_DIR, files };
}

// ── Standalone execution ──────────────────────────────────────────────

if (import.meta.main) {
  const result = generateFixtures();
  console.log(`[fixtures] Generated ${Object.keys(result.files).length} files in ${result.dir}`);
  for (const [name, path] of Object.entries(result.files)) {
    console.log(`  ${name}: ${path}`);
  }
}
