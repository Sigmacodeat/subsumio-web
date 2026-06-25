/**
 * Gap 13: Word-Export — formatierter .docx Output.
 *
 * Generiert echte .docx-Dateien (Office Open XML) aus Markdown-Text
 * using jszip (already a dependency). Kein externes `docx`-Package nötig.
 *
 * Features:
 * - Heading-Levels (H1-H3) als Word-Styles
 * - Bold/Italic inline
 * - Bullet lists
 * - Numbered lists
 * - Paragraphs mit korrektem Spacing
 * - Header mit Titel + Datum
 * - Footer mit Seitenzahl + "Generiert von Subsumio"
 */

import JSZip from "jszip";

interface DocxOptions {
  title: string;
  author?: string;
  caseRef?: string;
}

/**
 * Convert simple Markdown to Word OOXML paragraphs.
 * Supports: # H1, ## H2, ### H3, **bold**, *italic*, - bullet, 1. numbered, > quote
 */
function markdownToDocxParagraphs(md: string): string[] {
  const lines = md.split("\n");
  const paragraphs: string[] = [];
  let inBulletList = false;
  let inNumberedList = false;
  let _listNum = 1;

  const escapeXml = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const formatInline = (text: string): string => {
    let result = escapeXml(text);
    // Bold: **text** or __text__
    result = result.replace(
      /\*\*(.+?)\*\*/g,
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>'
    );
    result = result.replace(
      /__(.+?)__/g,
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>'
    );
    // Italic: *text* or _text_
    result = result.replace(
      /\*(.+?)\*/g,
      '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>'
    );
    result = result.replace(
      /(?<!\w)_(.+?)_(?!\w)/g,
      '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>'
    );
    // If no formatting was applied, wrap in a plain run
    if (!result.includes("<w:r>")) {
      result = `<w:r><w:t xml:space="preserve">${result}</w:t></w:r>`;
    }
    return result;
  };

  const closeList = () => {
    inBulletList = false;
    inNumberedList = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      closeList();
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      closeList();
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr>${formatInline(line.slice(4))}</w:p>`
      );
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${formatInline(line.slice(3))}</w:p>`
      );
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${formatInline(line.slice(2))}</w:p>`
      );
      continue;
    }

    // Quote
    if (line.startsWith("> ")) {
      closeList();
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${formatInline(line.slice(2))}</w:p>`
      );
      continue;
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      inNumberedList = false;
      if (!inBulletList) {
        inBulletList = true;
      }
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${formatInline(line.slice(2))}</w:p>`
      );
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      inBulletList = false;
      if (!inNumberedList) {
        inNumberedList = true;
        _listNum = 1;
      }
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="ListNumber"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>${formatInline(numMatch[2]!)}</w:p>`
      );
      continue;
    }

    // Table row detection — render as plain paragraph with tabs
    if (line.startsWith("|")) {
      closeList();
      const cells = line
        .split("|")
        .filter((c, i, arr) => i > 0 && i < arr.length - 1)
        .map((c) => c.trim());
      if (cells.length > 0 && !cells[0]!.startsWith("---")) {
        const cellRuns = cells
          .map(
            (c) => `<w:r><w:t xml:space="preserve">${escapeXml(c)}</w:t></w:r><w:r><w:tab/></w:r>`
          )
          .join("");
        paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr>${cellRuns}</w:p>`);
      }
      continue;
    }

    // Regular paragraph
    closeList();
    paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${formatInline(line)}</w:p>`);
  }

  return paragraphs;
}

/**
 * Generate a .docx file from Markdown text.
 * Returns a Uint8Array that can be saved as a .docx file.
 */
export async function generateDocx(md: string, opts: DocxOptions): Promise<Uint8Array> {
  const zip = new JSZip();

  // ── [Content_Types].xml ──────────────────────────────────
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`
  );

  // ── _rels/.rels ──────────────────────────────────────────
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // ── word/_rels/document.xml.rels ─────────────────────────
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`
  );

  // ── word/styles.xml ──────────────────────────────────────
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120" w:line="276"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="200" w:after="120"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="80" w:after="80"/><w:ind w:left="567"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="666666"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListNumber">
    <w:name w:val="List Number"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TableText">
    <w:name w:val="Table Text"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:sz w:val="20"/></w:rPr>
  </w:style>
</w:styles>`
  );

  // ── word/header1.xml ─────────────────────────────────────
  const headerDate = new Date().toLocaleDateString("de-AT");
  zip.file(
    "word/header1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="right"/></w:pPr>
  <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="999999"/></w:rPr>
  <w:t xml:space="preserve">${opts.title} — ${headerDate}${opts.caseRef ? " — " + opts.caseRef : ""}</w:t></w:r></w:p>
</w:hdr>`
  );

  // ── word/footer1.xml ─────────────────────────────────────
  zip.file(
    "word/footer1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="center"/></w:pPr>
  <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="999999"/></w:rPr>
  <w:t xml:space="preserve">Generiert von Subsumio Legal AI — Seite </w:t></w:r>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
</w:ftr>`
  );

  // ── word/document.xml ────────────────────────────────────
  const paragraphs = markdownToDocxParagraphs(md);
  const bodyContent = paragraphs.join("\n    ");

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyContent}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      <w:footerReference w:type="default" r:id="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
  );

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
