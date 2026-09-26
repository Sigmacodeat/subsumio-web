// @vitest-environment node
// End-to-End mit echter jsPDF-Instanz: Schriftsatz- und Vollmacht-PDF tragen
// Sprache, Metadaten, Lesezeichen und „Seite X von Y“ im Bytestrom.
import { describe, expect, test } from "vitest";
import { generateDraftPdf } from "./legal-draft-pdf";
import { generatePoaPdf } from "./poa-template";
import type { PowerOfAttorney } from "./power-of-attorney";

describe("generateDraftPdf — Barrierefreiheit", () => {
  const longBody = Array.from(
    { length: 12 },
    (_, i) =>
      `## Abschnitt ${i + 1}\n\n${"Lorem ipsum dolor sit amet, consetetur sadipscing elitr. ".repeat(20)}`
  ).join("\n\n");

  test("setzt Sprache, Titel, Lesezeichen und Gesamtseitenzahl", () => {
    const doc = generateDraftPdf({
      title: "Klageentwurf Muster gegen Beispiel",
      caseRef: "AZ-2026-042",
      draftType: "klage_entwurf",
      content: longBody,
      kanzlei: { name: "Kanzlei Beispiel" },
    });
    const out = doc.output();
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    expect(out).toMatch(/\/Lang \(de-AT\)/);
    expect(out).toContain("/Title (Klageentwurf Muster gegen Beispiel)");
    expect(out).toContain("/Subject (Klageentwurf");
    expect(out).toContain("/Author (Kanzlei Beispiel)");
    expect(out).toContain("/ViewerPreferences <</DisplayDocTitle true>>");
    expect(out).toMatch(/\/Outlines/);
    expect(out).toContain("/Title (Abschnitt 1)");
    expect(out).toContain("/Title (Abschnitt 12)");
    expect(out).toContain(`Seite 1 von ${pages}`);
    expect(out).toContain(`Seite ${pages} von ${pages}`);
    expect(out).not.toContain("{gesamt}");
  });

  test("übernimmt de-DE, wenn die Kanzlei es wünscht", () => {
    const out = generateDraftPdf({ title: "T", content: "Text", lang: "de-DE" }).output();
    expect(out).toMatch(/\/Lang \(de-DE\)/);
  });
});

describe("generatePoaPdf — Barrierefreiheit", () => {
  const poa = {
    id: "poa-1",
    type: "litigation",
    client_name: "Max Muster",
    case_slug: "akte-2026-001",
    scope: "Vertretung in allen Instanzen.",
    created_at: "2026-09-26T10:00:00.000Z",
  } as unknown as PowerOfAttorney;

  test("setzt Sprache, Titel und Lesezeichen-Hierarchie", () => {
    const out = generatePoaPdf({ poa, kanzlei: { name: "Kanzlei Beispiel" } }).output();
    expect(out).toMatch(/\/Lang \(de-AT\)/);
    expect(out).toMatch(/\/Title \(Vollmacht/);
    expect(out).toContain("/Author (Kanzlei Beispiel)");
    expect(out).toContain("/Title (Umfang der Vollmacht)");
    expect(out).toContain("/Title (Unterschrift)");
    expect(out).toMatch(/\/PageMode \/UseOutlines/);
  });
});
