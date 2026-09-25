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
 * - Footer mit Seitenzahl + sichtbarem KI-Hinweis
 * - Maschinenlesbare KI-Kennzeichnung (Art. 50 Abs. 2 VO (EU) 2024/1689) in
 *   den Dokumenteigenschaften: docProps/core.xml (Beschreibung, Stichwörter)
 *   und docProps/custom.xml (AIGenerated = true u. a.)
 */

import JSZip from "jszip";
import { generateLetterhead, type LetterheadConfig } from "@/lib/letterhead-rubrum";

interface DocxOptions {
  title: string;
  author?: string;
  caseRef?: string;
  /**
   * Kanzlei-Briefpapier für die erste Seite. LetterheadConfig existierte
   * bereits (letterhead-rubrum.ts) mit einem fertigen Markdown-Generator,
   * hatte aber keinen Aufrufer — der DOCX-Export zeigte bisher gar kein
   * Briefpapier, nur einen generischen "Titel — Datum"-Kopf auf jeder Seite.
   */
  letterhead?: LetterheadConfig;
  /**
   * Inhalt ist (ganz oder teilweise) KI-erzeugt. Standard: true — beide
   * Aufrufer exportieren Entwürfe/Arbeitsergebnisse aus dem KI-Workflow. Nur
   * für nachweislich rein menschlich verfasste Inhalte auf false setzen.
   */
  aiGenerated?: boolean;
}

/** Sichtbarer und maschinenlesbarer KI-Hinweis (Art. 50 Abs. 2 KI-VO). */
export const AI_DOCX_NOTICE = "KI-generiert (Subsumio), anwaltlich zu prüfen";
const AI_ACT_REFERENCE = "Art. 50 Abs. 2 VO (EU) 2024/1689";

const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** docProps/core.xml — Titel, Autor, Zeitstempel und (bei KI-Inhalt) Kennzeichnung. */
function corePropsXml(opts: DocxOptions, aiGenerated: boolean, now: Date): string {
  const iso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const aiFields = aiGenerated
    ? `
  <dc:description>${xmlEscape(`${AI_DOCX_NOTICE} — Kennzeichnung nach ${AI_ACT_REFERENCE}`)}</dc:description>
  <cp:keywords>${xmlEscape(`KI-generiert; Subsumio; anwaltlich zu prüfen`)}</cp:keywords>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(opts.title)}</dc:title>
  <dc:creator>${xmlEscape(opts.author || "Subsumio")}</dc:creator>${aiFields}
  <dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>
</cp:coreProperties>`;
}

/** docProps/custom.xml — eindeutige, maschinenlesbare KI-Kennzeichnung. */
function customPropsXml(): string {
  const fmtid = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";
  const props: Array<[string, string]> = [
    ["AIGenerated", "<vt:bool>true</vt:bool>"],
    ["AIGenerator", "<vt:lpwstr>Subsumio</vt:lpwstr>"],
    ["AIReviewStatus", `<vt:lpwstr>${xmlEscape("anwaltlich zu prüfen")}</vt:lpwstr>`],
    ["AIDisclosure", `<vt:lpwstr>${xmlEscape(AI_ACT_REFERENCE)}</vt:lpwstr>`],
  ];
  const body = props
    .map(
      ([name, value], i) =>
        `  <property fmtid="${fmtid}" pid="${i + 2}" name="${name}">${value}</property>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
${body}
</Properties>`;
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

  const run = (text: string, rPr = ""): string =>
    `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

  // Every piece of text must sit in its own <w:r> — bare text inside <w:p>
  // is invalid OOXML (Word reports unreadable content or drops the text).
  const formatInline = (text: string): string => {
    // Backslash escapes (`\*`, `\_`, `\#` …) stand for the literal character —
    // e.g. template values that must not turn into formatting. They are parked
    // in private-use placeholders and restored after the inline pass.
    const literals: string[] = [];
    const unescaped = text.replace(/\\([\\`*_[\]()#>|~+\-.!])/g, (_m, ch: string) => {
      literals.push(ch);
      return `\uE000${literals.length - 1}\uE001`;
    });
    // Links keep their target visible in print: "[§ 1295 ABGB](url)" → "§ 1295 ABGB (url)".
    const src = unescaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
    const rx = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|(?<!\w)_(.+?)_(?!\w)/g;
    const runs: string[] = [];
    let last = 0;
    for (const m of src.matchAll(rx)) {
      if (m.index! > last) runs.push(run(src.slice(last, m.index)));
      const bold = m[1] ?? m[2];
      runs.push(bold !== undefined ? run(bold, "<w:b/>") : run((m[3] ?? m[4])!, "<w:i/>"));
      last = m.index! + m[0].length;
    }
    if (last < src.length) runs.push(run(src.slice(last)));
    const joined = runs.join("") || run("");
    return literals.length === 0
      ? joined
      : joined.replace(/\uE000(\d+)\uE001/g, (_m, i: string) => escapeXml(literals[Number(i)]!));
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
  const aiGenerated = opts.aiGenerated !== false;

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
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${
    aiGenerated
      ? `
  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>`
      : ""
  }
</Types>`
  );

  // ── _rels/.rels ──────────────────────────────────────────
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>${
    aiGenerated
      ? `
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>`
      : ""
  }
</Relationships>`
  );

  // ── docProps (Dokumenteigenschaften) ─────────────────────
  zip.file("docProps/core.xml", corePropsXml(opts, aiGenerated, new Date()));
  if (aiGenerated) zip.file("docProps/custom.xml", customPropsXml());

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
  <w:t xml:space="preserve">${xmlEscape(`${opts.title} — ${headerDate}${opts.caseRef ? " — " + opts.caseRef : ""}`)}</w:t></w:r></w:p>
</w:hdr>`
  );

  // ── word/footer1.xml ─────────────────────────────────────
  const footerBankLine = opts.letterhead?.bank_details
    ? `${opts.letterhead.bank_details.bank_name ? opts.letterhead.bank_details.bank_name + " — " : ""}IBAN ${opts.letterhead.bank_details.iban} · BIC ${opts.letterhead.bank_details.bic}`
    : "";
  const footerVatLine = [
    opts.letterhead?.vat_id ? `UID ${opts.letterhead.vat_id}` : "",
    opts.letterhead?.tax_number ? `StNr ${opts.letterhead.tax_number}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const footerLetterheadRun = (text: string) =>
    text
      ? `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="center"/></w:pPr>
  <w:r><w:rPr><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
  <w:t xml:space="preserve">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>`
      : "";
  zip.file(
    "word/footer1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  ${footerLetterheadRun(footerBankLine)}
  ${footerLetterheadRun(footerVatLine)}
  <w:p><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="center"/></w:pPr>
  <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="999999"/></w:rPr>
  <w:t xml:space="preserve">${aiGenerated ? xmlEscape(AI_DOCX_NOTICE) : "Erstellt mit Subsumio"} — Seite </w:t></w:r>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
</w:ftr>`
  );

  // ── word/document.xml ────────────────────────────────────
  // Letterhead goes at the top of page 1 as ordinary body content (like a
  // real paper letterhead), not a repeating page header — the running
  // header above (title + date) already serves continuation pages.
  // markdownToDocxParagraphs has no "---" horizontal-rule support (it would
  // print as literal dashes), so a blank line is the separator instead.
  const letterheadMd = opts.letterhead ? generateLetterhead(opts.letterhead) + "\n\n\n" : "";
  const paragraphs = markdownToDocxParagraphs(letterheadMd + md);
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
