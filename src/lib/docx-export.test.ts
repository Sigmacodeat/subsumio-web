// @vitest-environment node

import { describe, test, expect } from "vitest";
import JSZip from "jszip";
import { generateDocx } from "./docx-export";

async function extractDocxFiles(docx: Uint8Array): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(docx);
  const files: Record<string, string> = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) {
      files[name] = await entry.async("string");
    }
  }
  return files;
}

describe("generateDocx", () => {
  test("generates a non-empty Uint8Array", async () => {
    const docx = await generateDocx("Hello World", { title: "Test" });
    expect(docx).toBeInstanceOf(Uint8Array);
    expect(docx.length).toBeGreaterThan(100);
  });

  test("includes title in header", async () => {
    const docx = await generateDocx("Body", { title: "Klage" });
    const files = await extractDocxFiles(docx);
    expect(files["word/header1.xml"]).toContain("Klage");
  });

  test("includes markdown headings as Word styles", async () => {
    const docx = await generateDocx("# Title\n## Subtitle\n### Section", { title: "Test" });
    const files = await extractDocxFiles(docx);
    expect(files["word/document.xml"]).toContain("Heading1");
    expect(files["word/document.xml"]).toContain("Heading2");
    expect(files["word/document.xml"]).toContain("Heading3");
  });

  test("includes formatted inline text", async () => {
    const docx = await generateDocx("**bold** and *italic*", { title: "Test" });
    const files = await extractDocxFiles(docx);
    expect(files["word/document.xml"]).toContain("<w:b/>");
    expect(files["word/document.xml"]).toContain("<w:i/>");
  });

  test("includes bullet list markup", async () => {
    const docx = await generateDocx("- first\n- second", { title: "Test" });
    const files = await extractDocxFiles(docx);
    expect(files["word/document.xml"]).toContain("ListBullet");
  });

  test("includes numbered list markup", async () => {
    const docx = await generateDocx("1. first\n2. second", { title: "Test" });
    const files = await extractDocxFiles(docx);
    expect(files["word/document.xml"]).toContain("ListNumber");
  });

  test("includes case reference in header", async () => {
    const docx = await generateDocx("Body", { title: "Test", caseRef: "AZ-123" });
    const files = await extractDocxFiles(docx);
    expect(files["word/header1.xml"]).toContain("AZ-123");
  });

  test("is a valid zip structure", async () => {
    const docx = await generateDocx("Body", { title: "Test" });
    const files = await extractDocxFiles(docx);
    expect(Object.keys(files)).toContain("[Content_Types].xml");
    expect(Object.keys(files)).toContain("word/document.xml");
    expect(Object.keys(files)).toContain("word/styles.xml");
  });
});

describe("generateDocx — inline formatting stays valid OOXML", () => {
  test("text around bold/italic is wrapped in runs, never bare inside <w:p>", async () => {
    const files = await extractDocxFiles(
      await generateDocx("Der Kläger begehrt **Schadenersatz** und *Zinsen*.", { title: "T" })
    );
    const para = files["word/document.xml"].match(/<w:p>(?:(?!<\/w:p>).)*Kläger.*?<\/w:p>/s)![0];
    // Strip all runs; nothing but paragraph properties may remain.
    const outside = para.replace(/<w:pPr>.*?<\/w:pPr>/s, "").replace(/<w:r>.*?<\/w:r>/gs, "");
    expect(outside).toBe("<w:p></w:p>");
    expect(para).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Schadenersatz</w:t>');
  });

  test("markdown links keep their URL visible, XML-escaped", async () => {
    const files = await extractDocxFiles(
      await generateDocx("[§ 1295 ABGB](https://www.ris.bka.gv.at/x?a=1&b=2)", { title: "T" })
    );
    expect(files["word/document.xml"]).toContain(
      "§ 1295 ABGB (https://www.ris.bka.gv.at/x?a=1&amp;b=2)"
    );
  });
});

describe("generateDocx — KI-Kennzeichnung nach Art. 50 Abs. 2 KI-VO", () => {
  test("AI content is marked machine-readably in core and custom document properties", async () => {
    const files = await extractDocxFiles(await generateDocx("Entwurf", { title: "Klage" }));
    const core = files["docProps/core.xml"];
    expect(core).toContain("<dc:title>Klage</dc:title>");
    expect(core).toContain("KI-generiert (Subsumio), anwaltlich zu prüfen");
    expect(core).toMatch(/<cp:keywords>[^<]*KI-generiert/);
    const custom = files["docProps/custom.xml"];
    expect(custom).toMatch(/name="AIGenerated"><vt:bool>true<\/vt:bool>/);
    expect(custom).toContain('name="AIGenerator"><vt:lpwstr>Subsumio</vt:lpwstr>');
    expect(custom).toContain("anwaltlich zu prüfen");
  });

  test("property parts are registered in content types and package relationships", async () => {
    const files = await extractDocxFiles(await generateDocx("Entwurf", { title: "T" }));
    expect(files["[Content_Types].xml"]).toContain('PartName="/docProps/core.xml"');
    expect(files["[Content_Types].xml"]).toContain('PartName="/docProps/custom.xml"');
    expect(files["_rels/.rels"]).toContain('Target="docProps/core.xml"');
    expect(files["_rels/.rels"]).toContain('Target="docProps/custom.xml"');
  });

  test("visible footer carries the notice", async () => {
    const files = await extractDocxFiles(await generateDocx("Entwurf", { title: "T" }));
    expect(files["word/footer1.xml"]).toContain("KI-generiert (Subsumio), anwaltlich zu prüfen");
  });

  test("aiGenerated: false omits the AI marking", async () => {
    const files = await extractDocxFiles(
      await generateDocx("Handschrift", { title: "T", aiGenerated: false })
    );
    expect(files["docProps/custom.xml"]).toBeUndefined();
    expect(files["docProps/core.xml"]).not.toContain("KI-generiert");
    expect(files["[Content_Types].xml"]).not.toContain("custom.xml");
    expect(files["word/footer1.xml"]).not.toContain("KI-generiert");
  });

  test("title with XML special characters stays well-formed", async () => {
    const files = await extractDocxFiles(await generateDocx("x", { title: "A & B <C>" }));
    expect(files["docProps/core.xml"]).toContain("<dc:title>A &amp; B &lt;C&gt;</dc:title>");
    expect(files["word/header1.xml"]).toContain("A &amp; B &lt;C&gt;");
  });
});
