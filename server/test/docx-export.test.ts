import { describe, it, expect } from "bun:test";
import JSZip from "jszip";
import {
  buildDocumentXml,
  draftToDocx,
  inlineRuns,
  markdownToParagraphs,
  stripFrontmatter,
  xmlEscape,
} from "../src/core/legal/docx-export.ts";

describe("xmlEscape", () => {
  it("escapes all five XML specials", () => {
    expect(xmlEscape(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
  });
});

describe("inlineRuns", () => {
  it("splits **bold** into runs", () => {
    const runs = inlineRuns("Der **Beklagte** haftet");
    expect(runs).toHaveLength(3);
    expect(runs[1]).toEqual({ text: "Beklagte", bold: true });
  });

  it("plain text is one run", () => {
    expect(inlineRuns("nur Text")).toEqual([{ text: "nur Text" }]);
  });
});

describe("markdownToParagraphs", () => {
  it("maps headings, bullets and paragraphs", () => {
    const md = "# Klage\n\n## Sachverhalt\n\n- Punkt eins\n\nNormaler Absatz";
    const ps = markdownToParagraphs(md);
    expect(ps).toHaveLength(4);
    expect(ps[0]).toContain('w:val="Heading1"');
    expect(ps[1]).toContain('w:val="Heading2"');
    expect(ps[2]).toContain("• ");
    expect(ps[3]).toContain("Normaler Absatz");
  });

  it("caps heading depth at 3", () => {
    const ps = markdownToParagraphs("#### tief");
    expect(ps[0]).toContain('w:val="Heading3"');
  });
});

describe("stripFrontmatter", () => {
  it("removes YAML frontmatter", () => {
    expect(stripFrontmatter("---\ntitle: x\n---\n\nBody")).toBe("Body");
  });

  it("passes through frontmatter-less text", () => {
    expect(stripFrontmatter("Body only")).toBe("Body only");
  });
});

describe("buildDocumentXml", () => {
  it("contains Briefkopf, Rubrum and ERV block", () => {
    const xml = buildDocumentXml({
      titel: "Klage",
      markdown: "# Klage\n\nDer Kläger begehrt...",
      kanzlei: {
        name: "Kanzlei Example & Partner",
        adresse: "Beispielgasse 1, 1010 Wien",
        ervTeilnehmerkennung: "R123456",
      },
      rubrum: {
        gericht: "Landesgericht für ZRS Wien",
        geschaeftszahl: "10 Cg 12/26x",
        klaeger: "Max Mustermann",
        klaegerVertreter: "RA Dr. Example",
        beklagter: "Widget Co GmbH",
        streitwert: "€ 30.000,00",
        schriftsatzart: "Klage",
      },
    });
    expect(xml).toContain("Kanzlei Example &amp; Partner");
    expect(xml).toContain("An das Landesgericht für ZRS Wien");
    expect(xml).toContain("GZ: 10 Cg 12/26x");
    expect(xml).toContain("Klagende Partei: ");
    expect(xml).toContain("Streitwert: € 30.000,00");
    expect(xml).toContain("ERV-Versandhinweise");
    expect(xml).toContain("Schriftsatzart: Klage");
    expect(xml).toContain("ERV-Teilnehmerkennung: R123456");
    expect(xml).toContain("Der Kläger begehrt...");
  });

  it("works without Kanzlei/Rubrum (plain body)", () => {
    const xml = buildDocumentXml({ titel: "x", markdown: "Absatz" });
    expect(xml).toContain("Absatz");
    expect(xml).not.toContain("ERV-Versandhinweise");
  });
});

describe("draftToDocx", () => {
  it("produces a valid docx package with all parts", async () => {
    const buf = await draftToDocx({ titel: "Klage", markdown: "# Klage\n\nText" });
    // PK zip magic
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("_rels/.rels")).not.toBeNull();
    expect(zip.file("word/document.xml")).not.toBeNull();
    expect(zip.file("word/styles.xml")).not.toBeNull();
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("<w:document");
    expect(doc).toContain("Text");
  });

  it("is byte-deterministic", async () => {
    const a = await draftToDocx({ titel: "x", markdown: "Gleich" });
    const b = await draftToDocx({ titel: "x", markdown: "Gleich" });
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it("escapes hostile content from the Akt", async () => {
    const buf = await draftToDocx({
      titel: "x",
      markdown: 'Angriff <script>alert("xss")</script> & Co',
    });
    const zip = await JSZip.loadAsync(buf);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).not.toContain("<script>");
    expect(doc).toContain("&lt;script&gt;");
  });
});
