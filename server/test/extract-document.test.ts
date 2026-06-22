import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  isDocumentFilePath,
  extractDocumentText,
  synthesizeDocumentMarkdown,
  SUPPORTED_DOCUMENT_EXTS,
} from '../src/core/extract-document.ts';
import { importFile } from '../src/core/import-file.ts';
import type { BrainEngine } from '../src/core/engine.ts';

const TMP = join(import.meta.dir, '.tmp-extract-document-test');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal valid PDF with one page of real text (no xref — parsers recover). */
function pdfFixture(text: string): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${text.length + 30}>>stream
BT /F1 24 Tf 72 720 Td (${text}) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>`,
    'latin1',
  );
}

/** Empty-page PDF (no text operators) — the scanned-PDF shape. */
function emptyPdfFixture(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
trailer<</Root 1 0 R>>`,
    'latin1',
  );
}

/** Minimal docx built from the three required OOXML parts. */
async function docxFixture(text: string): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

const EML_FIXTURE = [
  'From: Alice Example <alice@example.com>',
  'To: bob@example.com',
  'Subject: Fristsache Akte 2026-114',
  'Date: Mon, 1 Jun 2026 10:00:00 +0200',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Bitte die Frist am 15.06. beachten.',
  '',
].join('\r\n');

async function xlsxFixture(): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Mandant', 'Umsatz'],
    ['widget-co', 12000],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Q1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// Mock engine: same pattern as import-file.test.ts — tracks nothing, accepts
// everything, transaction() just invokes the callback on itself.
function mockEngine(): BrainEngine {
  const engine = new Proxy({} as any, {
    get(_, prop: string) {
      if (prop === 'getTags') return () => Promise.resolve([]);
      if (prop === 'getPage') return () => Promise.resolve(null);
      if (prop === 'transaction') return async (fn: (tx: BrainEngine) => Promise<any>) => fn(engine);
      return () => Promise.resolve(null);
    },
  });
  return engine;
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// isDocumentFilePath
// ---------------------------------------------------------------------------

describe('isDocumentFilePath', () => {
  test('accepts every supported extension, case-insensitively', () => {
    for (const ext of SUPPORTED_DOCUMENT_EXTS) {
      expect(isDocumentFilePath(`akte/datei${ext}`)).toBe(true);
      expect(isDocumentFilePath(`akte/DATEI${ext.toUpperCase()}`)).toBe(true);
    }
  });

  test('rejects markdown, code and image paths', () => {
    expect(isDocumentFilePath('notes/page.md')).toBe(false);
    expect(isDocumentFilePath('src/core/sync.ts')).toBe(false);
    expect(isDocumentFilePath('photos/scan.png')).toBe(false);
    expect(isDocumentFilePath('archive/file.pdf.md')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractDocumentText
// ---------------------------------------------------------------------------

describe('extractDocumentText', () => {
  test('pdf: extracts text layer and page count', async () => {
    const out = await extractDocumentText(
      pdfFixture('Hello Subsumio document extraction works flawlessly end to end'),
      '.pdf',
    );
    expect(out.text).toContain('Hello Subsumio');
    expect(out.frontmatter.source_format).toBe('pdf');
    expect(out.frontmatter.pages).toBe(1);
    expect(out.warnings).toHaveLength(0);
    // A digital text layer is read verbatim — tagged trusted, never carries
    // the unverified banner or flag (those are reserved for OCR/transcription).
    expect(out.frontmatter.extraction_method).toBe('text_layer');
    expect(out.frontmatter.extraction_unverified).toBeUndefined();
    expect(out.text).not.toContain('Unverifizierte Extraktion');
  });

  test('pdf: flags sparse text layer (scanned-PDF shape)', async () => {
    const out = await extractDocumentText(emptyPdfFixture(), '.pdf');
    expect(out.text.trim()).toBe('');
    expect(out.warnings.some((w) => w.startsWith('pdf_text_layer_sparse'))).toBe(true);
  });

  test('docx: extracts paragraph text', async () => {
    const out = await extractDocumentText(await docxFixture('Mandantengespräch Notiz'), '.docx');
    expect(out.text).toContain('Mandantengespräch Notiz');
    expect(out.frontmatter.source_format).toBe('docx');
  });

  test('eml: extracts headers, body, subject-title and date', async () => {
    const out = await extractDocumentText(Buffer.from(EML_FIXTURE), '.eml');
    expect(out.text).toContain('**From:** Alice Example <alice@example.com>');
    expect(out.text).toContain('Bitte die Frist am 15.06. beachten.');
    expect(out.frontmatter.title).toBe('Fristsache Akte 2026-114');
    expect(out.frontmatter.type).toBe('email');
    expect(out.frontmatter.date).toBe('2026-06-01');
  });

  test('csv: passes text through', async () => {
    const out = await extractDocumentText(Buffer.from('a,b\n1,2\n'), '.csv', { filename: 'data.csv' });
    expect(out.text).toBe('a,b\n1,2');
    expect(out.frontmatter.source_format).toBe('csv');
    expect(out.frontmatter.title).toBe('data.csv');
  });

  test('xlsx: one section per sheet, as CSV', async () => {
    const out = await extractDocumentText(await xlsxFixture(), '.xlsx');
    expect(out.text).toContain('## Sheet: Q1');
    expect(out.text).toContain('widget-co,12000');
    expect(out.frontmatter.sheets).toBe(1);
  });

  test('unsupported extension throws', async () => {
    await expect(extractDocumentText(Buffer.from('x'), '.zip')).rejects.toThrow('Unsupported document extension');
  });
});

// ---------------------------------------------------------------------------
// synthesizeDocumentMarkdown
// ---------------------------------------------------------------------------

describe('synthesizeDocumentMarkdown', () => {
  test('builds frontmatter with filename-derived title, never a slug', () => {
    const md = synthesizeDocumentMarkdown('akte/klage-2026.pdf', {
      text: 'Body text.',
      frontmatter: { type: 'document', source_format: 'pdf', pages: 3 },
      warnings: [],
    });
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('title: "klage-2026"');
    expect(md).toContain('pages: 3');
    expect(md).toContain('Body text.');
    expect(md).not.toContain('slug:');
  });

  test('keeps an extraction-provided title (eml subject)', () => {
    const md = synthesizeDocumentMarkdown('mail/x.eml', {
      text: 'Hi',
      frontmatter: { type: 'email', source_format: 'eml', title: 'Fristsache' },
      warnings: [],
    });
    expect(md).toContain('title: "Fristsache"');
  });
});

// ---------------------------------------------------------------------------
// importFile integration (mock engine, no embed)
// ---------------------------------------------------------------------------

describe('importFile document routing', () => {
  test('imports a .pdf as a normal page with path-derived slug', async () => {
    const filePath = join(TMP, 'vertrag.pdf');
    writeFileSync(filePath, pdfFixture('Liefervertrag Klausel 7'));
    const result = await importFile(mockEngine(), filePath, 'akten/vertrag.pdf', { noEmbed: true });
    expect(result.status).toBe('imported');
    expect(result.slug).toContain('akten/');
    expect(result.chunks).toBeGreaterThan(0);
  });

  test('skips a text-free (scanned) pdf with the sparse warning as reason', async () => {
    const filePath = join(TMP, 'scan.pdf');
    writeFileSync(filePath, emptyPdfFixture());
    const result = await importFile(mockEngine(), filePath, 'akten/scan.pdf', { noEmbed: true });
    expect(result.status).toBe('skipped');
    expect(result.error).toContain('pdf_text_layer_sparse');
  });

  test('imports an .eml with email type and date frontmatter applied', async () => {
    const filePath = join(TMP, 'frist.eml');
    writeFileSync(filePath, EML_FIXTURE);
    const result = await importFile(mockEngine(), filePath, 'mail/frist.eml', { noEmbed: true });
    expect(result.status).toBe('imported');
  });

  test('corrupt document degrades to a skip, not a crash', async () => {
    const filePath = join(TMP, 'broken.docx');
    writeFileSync(filePath, Buffer.from('this is not a zip'));
    const result = await importFile(mockEngine(), filePath, 'docs/broken.docx', { noEmbed: true });
    expect(result.status).toBe('skipped');
    expect(result.error).toContain('Document extraction failed');
  });
});
