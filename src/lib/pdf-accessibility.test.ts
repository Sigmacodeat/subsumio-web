// @vitest-environment node
// Echte jsPDF-Instanz (kein Mock): prüft, dass Sprache, Metadaten,
// Titelleisten-Anzeige und Lesezeichen wirklich im PDF-Bytestrom landen.
import { describe, expect, test } from "vitest";
import { jsPDF } from "jspdf";
import {
  PDF_MIN_FONT_PT,
  PDF_TOTAL_PAGES_TOKEN,
  accessibleFontSize,
  addPdfBookmark,
  applyPdfAccessibility,
  currentPageNumber,
  finalizePdfPageTotals,
} from "./pdf-accessibility";

function build(lang?: "de-AT" | "de-DE") {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  applyPdfAccessibility(doc, {
    title: "Honorarnote R-2026-001",
    subject: "Honorarnote der Kanzlei",
    author: "Kanzlei Muster",
    keywords: "Honorarnote, Rechnung",
    lang,
  });
  doc.setFontSize(accessibleFontSize(7));
  doc.text("Hallo", 20, 20);
  return doc;
}

describe("applyPdfAccessibility", () => {
  test("setzt Dokumentsprache de-AT im Catalog", () => {
    const out = build().output();
    expect(out).toMatch(/\/Lang \(de-AT\)/);
  });

  test("übernimmt eine abweichende Sprache", () => {
    const out = build("de-DE").output();
    expect(out).toMatch(/\/Lang \(de-DE\)/);
  });

  test("schreibt Titel, Betreff, Autor und Erzeuger ins Info-Dictionary", () => {
    const out = build().output();
    expect(out).toContain("/Title (Honorarnote R-2026-001)");
    expect(out).toContain("/Subject (Honorarnote der Kanzlei)");
    expect(out).toContain("/Author (Kanzlei Muster)");
    expect(out).toContain("/Keywords (Honorarnote, Rechnung)");
    expect(out).toMatch(/\/Creator \(Subsumio Kanzleisoftware\)/);
  });

  test("zeigt den Dokumenttitel in der Titelleiste (DisplayDocTitle)", () => {
    const out = build().output();
    const catalog = out.match(/\/Type \/Catalog[\s\S]*?endobj/)?.[0] ?? "";
    expect(catalog).toContain("/ViewerPreferences <</DisplayDocTitle true>>");
  });

  test("öffnet mit Lesezeichenleiste und fortlaufender Ansicht", () => {
    const out = build().output();
    expect(out).toMatch(/\/PageMode \/UseOutlines/);
    expect(out).toMatch(/\/PageLayout \/OneColumn/);
  });

  test("ist idempotent — der Catalog-Hook wird nur einmal registriert", () => {
    const doc = build();
    applyPdfAccessibility(doc, { title: "T", subject: "S" });
    const out = doc.output();
    expect(out.match(/DisplayDocTitle/g)?.length).toBe(1);
  });

  test("läuft ohne Plugin-Methoden (gemocktes Dokument) durch", () => {
    const fake = { internal: {} } as unknown as jsPDF;
    expect(() => applyPdfAccessibility(fake, { title: "T", subject: "S" })).not.toThrow();
    expect(currentPageNumber(fake)).toBe(1);
    expect(addPdfBookmark(fake, "X", 1)).toBeNull();
    expect(() => finalizePdfPageTotals(fake)).not.toThrow();
  });
});

describe("Lesezeichen und Seitenzahlen", () => {
  test("Outline-Einträge landen als Überschriftenhierarchie im PDF", () => {
    const doc = build();
    const root = addPdfBookmark(doc, "Rechnung", 1);
    expect(root).not.toBeNull();
    doc.addPage();
    addPdfBookmark(doc, "Auslagen", 2, root);
    const out = doc.output();
    expect(out).toMatch(/\/Outlines/);
    expect(out).toContain("/Title (Rechnung)");
    expect(out).toContain("/Title (Auslagen)");
  });

  test("putTotalPages ersetzt den Platzhalter durch die Gesamtseitenzahl", () => {
    const doc = build();
    doc.addPage();
    doc.text(`Seite ${currentPageNumber(doc)} von ${PDF_TOTAL_PAGES_TOKEN}`, 20, 20);
    finalizePdfPageTotals(doc);
    const out = doc.output();
    expect(out).toContain("Seite 2 von 2");
    expect(out).not.toContain(PDF_TOTAL_PAGES_TOKEN);
  });
});

describe("accessibleFontSize", () => {
  test("hebt zu kleine Schrift auf das Minimum an", () => {
    expect(accessibleFontSize(7)).toBe(PDF_MIN_FONT_PT);
    expect(accessibleFontSize(8)).toBe(9);
    expect(accessibleFontSize(11)).toBe(11);
  });
});
