// @vitest-environment node

import { describe, expect, test } from "vitest";
import PizZip from "pizzip";

import { DocxTemplateError, fillDocxBatch, fillDocxTemplate } from "./docx-template";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function makeDocx(bodyText: string): Buffer {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyText}</w:body>
</w:document>`
  );
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

function docxText(buf: Buffer): string {
  const zip = new PizZip(buf);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("word/document.xml fehlt im Ergebnis");
  return file.asText();
}

describe("fillDocxTemplate", () => {
  test("befüllt {{platzhalter}} im Dokument", () => {
    const docx = makeDocx(p("Sehr geehrte Frau {{mandant}}, Az {{az}}"));
    const out = fillDocxTemplate(docx, { mandant: "Muster", az: "26-0042" });
    const xml = docxText(out);
    expect(xml).toContain("Sehr geehrte Frau Muster");
    expect(xml).toContain("Az 26-0042");
    expect(xml).not.toContain("{{mandant}}");
  });

  test("über Run-Grenzen verteilte Platzhalter werden befüllt", () => {
    // Word zerlegt Text oft in mehrere <w:t>-Runs.
    const split = `<w:p><w:r><w:t>Az {{akten</w:t></w:r><w:r><w:t>zeichen}}</w:t></w:r></w:p>`;
    const out = fillDocxTemplate(makeDocx(split), { aktenzeichen: "26-0042" });
    expect(docxText(out)).toContain("26-0042");
  });

  test("Serienbrief-Loop {{#empfaenger}}", () => {
    const loop = `<w:p><w:r><w:t>{{#empfaenger}}</w:t></w:r></w:p>${p("Hallo {{name}}")}<w:p><w:r><w:t>{{/empfaenger}}</w:t></w:r></w:p>`;
    const out = fillDocxTemplate(makeDocx(loop), {
      empfaenger: [{ name: "A" }, { name: "B" }],
    } as never);
    const xml = docxText(out);
    expect(xml).toContain("Hallo A");
    expect(xml).toContain("Hallo B");
  });

  test("wirft bei Nicht-DOCX", () => {
    expect(() => fillDocxTemplate(Buffer.from("kein zip"), {})).toThrow(DocxTemplateError);
  });
});

describe("fillDocxBatch", () => {
  test("erzeugt eine Datei pro Empfängerzeile", () => {
    const docx = makeDocx(p("An {{name}}, Az {{az}}"));
    const out = fillDocxBatch(docx, [
      { values: { name: "Huber", az: "1" } },
      { filename: "brief-leitner.docx", values: { name: "Leitner", az: "2" } },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].filename).toBe("serienbrief-1.docx");
    expect(out[1].filename).toBe("brief-leitner.docx");
    expect(docxText(out[1].buffer)).toContain("An Leitner");
  });

  test("wirft bei leerer Empfängerliste", () => {
    expect(() => fillDocxBatch(makeDocx(p("x")), [])).toThrow(DocxTemplateError);
  });
});
