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
