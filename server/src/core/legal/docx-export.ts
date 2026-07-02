/**
 * docx-export.ts — DOCX export for legal drafts (Gap F).
 *
 * Drafts live as markdown pages; a Kanzlei files .docx. This module renders
 * a draft into a minimal, valid WordprocessingML package (via jszip — already
 * a dependency for XLSX handling) with:
 *
 *   - Kanzlei-Briefkopf (name, address, contact — from options)
 *   - Rubrum (Gericht, GZ, Parteien samt Vertretern, Streitwert) as the
 *     formal head every österreichische Eingabe carries
 *   - the draft body converted from markdown (headings, bullets, bold,
 *     plain paragraphs — the subset the drafter actually emits)
 *   - "ERV-ready" note block (Schriftsatzart + Empfänger) so the Konzipient
 *     only uploads via webERV/ADVOKAT
 *
 * Deterministic: same input → byte-identical document.xml (jszip container
 * timestamps are pinned). Fully unit-testable by unzipping in-memory.
 */

import JSZip from "jszip";

// ── XML helpers ─────────────────────────────────────────────

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface Run {
  text: string;
  bold?: boolean;
}

function runXml(r: Run): string {
  const props = r.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:r>${props}<w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`;
}

function paragraphXml(runs: Run[], opts?: { style?: string; center?: boolean }): string {
  const props: string[] = [];
  if (opts?.style) props.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts?.center) props.push('<w:jc w:val="center"/>');
  const pPr = props.length > 0 ? `<w:pPr>${props.join("")}</w:pPr>` : "";
  return `<w:p>${pPr}${runs.map(runXml).join("")}</w:p>`;
}

/** Split markdown inline **bold** into runs. */
export function inlineRuns(text: string): Run[] {
  const runs: Run[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      runs.push({ text: p.slice(2, -2), bold: true });
    } else {
      runs.push({ text: p });
    }
  }
  return runs.length > 0 ? runs : [{ text: "" }];
}

/** Convert the drafter's markdown subset into WordprocessingML paragraphs. */
export function markdownToParagraphs(markdown: string): string[] {
  const paragraphs: string[] = [];
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();
    const t = line.trim();
    if (t === "") continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      paragraphs.push(
        paragraphXml(inlineRuns(h[2]!), { style: `Heading${Math.min(h[1]!.length, 3)}` })
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(t);
    if (bullet) {
      paragraphs.push(paragraphXml([{ text: "• " }, ...inlineRuns(bullet[1]!)]));
      continue;
    }
    // Table rows and everything else become plain paragraphs (monospaced
    // table rendering is out of scope for v1 — the Konzipient formats tables).
    paragraphs.push(paragraphXml(inlineRuns(t)));
  }
  return paragraphs;
}

// ── Rubrum + Briefkopf ──────────────────────────────────────

export interface Kanzlei {
  name: string;
  adresse?: string;
  telefon?: string;
  email?: string;
  ervTeilnehmerkennung?: string;
}

export interface Rubrum {
  gericht?: string;
  geschaeftszahl?: string;
  klaeger?: string;
  klaegerVertreter?: string;
  beklagter?: string;
  beklagterVertreter?: string;
  streitwert?: string;
  betreff?: string;
  /** Schriftsatzart für den ERV-Versand (z.B. "Klage", "Berufung"). */
  schriftsatzart?: string;
}

function rubrumParagraphs(kanzlei: Kanzlei | undefined, rubrum: Rubrum | undefined): string[] {
  const out: string[] = [];
  if (kanzlei) {
    out.push(paragraphXml([{ text: kanzlei.name, bold: true }], { center: true }));
    const kontakt = [kanzlei.adresse, kanzlei.telefon, kanzlei.email]
      .filter(Boolean)
      .join(" · ");
    if (kontakt) out.push(paragraphXml([{ text: kontakt }], { center: true }));
    out.push(paragraphXml([{ text: "" }]));
  }
  if (rubrum) {
    if (rubrum.gericht) out.push(paragraphXml([{ text: `An das ${rubrum.gericht}`, bold: true }]));
    if (rubrum.geschaeftszahl) out.push(paragraphXml([{ text: `GZ: ${rubrum.geschaeftszahl}` }]));
    out.push(paragraphXml([{ text: "" }]));
    if (rubrum.klaeger) {
      out.push(paragraphXml([{ text: "Klagende Partei: ", bold: true }, { text: rubrum.klaeger }]));
      if (rubrum.klaegerVertreter)
        out.push(paragraphXml([{ text: `vertreten durch: ${rubrum.klaegerVertreter}` }]));
    }
    if (rubrum.beklagter) {
      out.push(paragraphXml([{ text: "Beklagte Partei: ", bold: true }, { text: rubrum.beklagter }]));
      if (rubrum.beklagterVertreter)
        out.push(paragraphXml([{ text: `vertreten durch: ${rubrum.beklagterVertreter}` }]));
    }
    if (rubrum.streitwert)
      out.push(paragraphXml([{ text: `Streitwert: ${rubrum.streitwert}` }]));
    out.push(paragraphXml([{ text: "" }]));
    if (rubrum.betreff)
      out.push(paragraphXml([{ text: rubrum.betreff, bold: true }], { center: true }));
    out.push(paragraphXml([{ text: "" }]));
  }
  return out;
}

// ── Package assembly ────────────────────────────────────────

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`;

export interface DraftDocxOpts {
  titel: string;
  markdown: string;
  kanzlei?: Kanzlei;
  rubrum?: Rubrum;
}

export function buildDocumentXml(opts: DraftDocxOpts): string {
  const paragraphs: string[] = [];
  paragraphs.push(...rubrumParagraphs(opts.kanzlei, opts.rubrum));
  paragraphs.push(...markdownToParagraphs(opts.markdown));

  // ERV-ready block
  if (opts.rubrum?.schriftsatzart || opts.kanzlei?.ervTeilnehmerkennung) {
    paragraphs.push(paragraphXml([{ text: "" }]));
    paragraphs.push(paragraphXml([{ text: "— ERV-Versandhinweise —", bold: true }]));
    if (opts.rubrum?.schriftsatzart)
      paragraphs.push(paragraphXml([{ text: `Schriftsatzart: ${opts.rubrum.schriftsatzart}` }]));
    if (opts.rubrum?.gericht)
      paragraphs.push(paragraphXml([{ text: `Empfänger: ${opts.rubrum.gericht}` }]));
    if (opts.kanzlei?.ervTeilnehmerkennung)
      paragraphs.push(
        paragraphXml([{ text: `ERV-Teilnehmerkennung: ${opts.kanzlei.ervTeilnehmerkennung}` }])
      );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${paragraphs.join("")}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417"/></w:sectPr>` +
    `</w:body></w:document>`
  );
}

/** Render a draft as a .docx buffer. Deterministic (pinned zip dates). */
export async function draftToDocx(opts: DraftDocxOpts): Promise<Buffer> {
  const zip = new JSZip();
  const date = new Date(Date.UTC(2020, 0, 1)); // pinned → deterministic bytes
  zip.file("[Content_Types].xml", CONTENT_TYPES, { date });
  zip.file("_rels/.rels", RELS, { date });
  zip.file("word/_rels/document.xml.rels", DOC_RELS, { date });
  zip.file("word/styles.xml", STYLES, { date });
  zip.file("word/document.xml", buildDocumentXml(opts), { date });
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return buf;
}

/** Strip frontmatter from a draft page body before export. */
export function stripFrontmatter(compiledTruth: string): string {
  if (compiledTruth.startsWith("---")) {
    const end = compiledTruth.indexOf("\n---", 3);
    if (end !== -1) return compiledTruth.slice(end + 4).trim();
  }
  return compiledTruth.trim();
}
