import { describe, test, expect } from "vitest";
import { extractCitations, type ExtractedCitation } from "@/lib/legal-graph/citations";

describe("extractCitations", () => {
  test("extracts BGH case citations with date and file number", () => {
    const text = `
      Das Urteil des BGH, Urteil vom 15.03.2024 - I ZR 1/24 hat dies klargestellt.
      Der Kläger beruft sich auf diese Entscheidung.
    `;
    const citations = extractCitations(text);
    const caseCitations = citations.filter((c) => c.type === "case");
    expect(caseCitations.length).toBeGreaterThanOrEqual(1);
    expect(caseCitations[0].reference).toContain("BGH");
    expect(caseCitations[0].reference).toContain("I ZR 1/24");
  });

  test("extracts BVerfG case citations", () => {
    const text = `
      Siehe BVerfG, Beschluss vom 10.5.2023 - 1 BvR 1234/23.
    `;
    const citations = extractCitations(text);
    const caseCitations = citations.filter((c) => c.type === "case");
    expect(caseCitations.length).toBeGreaterThanOrEqual(1);
    expect(caseCitations[0].reference).toContain("BVerfG");
  });

  test("extracts ECLI citations", () => {
    const text = `
      Vgl. ECLI:DE:BGH:2024:UR20240315.IZR1.24.00
    `;
    const citations = extractCitations(text);
    const ecliCitation = citations.find((c) => c.reference.includes("ECLI:DE:BGH"));
    expect(ecliCitation).toBeDefined();
    expect(ecliCitation!.type).toBe("case");
  });

  test("extracts journal citations (BGH NJW 2024, 123)", () => {
    const text = `
      Der BGH NJW 2024, 123 hat sich mit dieser Frage befasst.
    `;
    const citations = extractCitations(text);
    const journalCitation = citations.find((c) => c.reference.includes("NJW"));
    expect(journalCitation).toBeDefined();
  });

  test("extracts statute citations (§ 433 BGB)", () => {
    const text = `
      Gemäß § 433 BGB hat der Verkäufer die Pflicht zur Übereignung.
    `;
    const citations = extractCitations(text);
    const statuteCitations = citations.filter((c) => c.type === "statute");
    expect(statuteCitations.length).toBeGreaterThanOrEqual(1);
    expect(statuteCitations[0].reference).toContain("§ 433");
    expect(statuteCitations[0].reference).toContain("BGB");
    expect(statuteCitations[0].statute).toBe("BGB");
  });

  test("extracts multiple statute citations (§§ 433, 434 BGB)", () => {
    const text = `
      Die §§ 433, 434 BGB regeln die Hauptleistungspflichten beim Kaufvertrag.
    `;
    const citations = extractCitations(text);
    const statuteCitations = citations.filter((c) => c.type === "statute");
    expect(statuteCitations.length).toBeGreaterThanOrEqual(1);
  });

  test("extracts statute with Absatz and Nummer (§ 1 Abs. 1 Nr. 1 BGB)", () => {
    const text = `
      Nach § 1 Abs. 1 Nr. 1 BGB gilt diese Regelung.
    `;
    const citations = extractCitations(text);
    const statuteCitations = citations.filter((c) => c.type === "statute");
    expect(statuteCitations.length).toBeGreaterThanOrEqual(1);
  });

  test("extracts GG article citations (Art. 1 GG)", () => {
    const text = `
      Art. 1 GG garantiert die Menschenwürde.
    `;
    const citations = extractCitations(text);
    const ggCitation = citations.find((c) => c.reference.includes("Art. 1 GG"));
    expect(ggCitation).toBeDefined();
    expect(ggCitation!.type).toBe("statute");
  });

  test("extracts DSGVO article citations", () => {
    const text = `
      Art. 6 DSGVO regelt die Rechtmäßigkeit der Verarbeitung.
    `;
    const citations = extractCitations(text);
    const dsgvoCitation = citations.find((c) => c.reference.includes("DSGVO"));
    expect(dsgvoCitation).toBeDefined();
  });

  test("provides context snippets around citations", () => {
    const text = `
      Der Sachverhalt ist eindeutig. BGH, Urteil vom 15.03.2024 - I ZR 1/24
      hat dies bereits entschieden. Daher ist die Klage begründet.
    `;
    const citations = extractCitations(text);
    const caseCitation = citations.find((c) => c.type === "case");
    expect(caseCitation).toBeDefined();
    expect(caseCitation!.context.length).toBeGreaterThan(0);
    expect(caseCitation!.context).toContain("Sachverhalt");
  });

  test("deduplicates identical citations", () => {
    const text = `
      BGH, Urteil vom 15.03.2024 - I ZR 1/24.
      Siehe auch BGH, Urteil vom 15.03.2024 - I ZR 1/24.
    `;
    const citations = extractCitations(text);
    const caseCitations = citations.filter(
      (c) => c.type === "case" && c.reference.includes("I ZR 1/24")
    );
    expect(caseCitations.length).toBe(1);
  });

  test("returns empty array for text without citations", () => {
    const text = "Dies ist ein einfacher Text ohne juristische Zitate.";
    const citations = extractCitations(text);
    expect(citations).toEqual([]);
  });

  test("handles empty text", () => {
    const citations = extractCitations("");
    expect(citations).toEqual([]);
  });

  test("extracts citations from complex legal text with mixed types", () => {
    const text = `
      Der Kläger stützt seinen Anspruch auf § 433 Abs. 1 BGB.
      Der Beklagte verweist auf BGH, Urteil vom 20.1.2023 - VIII ZR 123/22,
      wo der BGH entschieden hat, dass die Gewährleistungsfrist abgelaufen ist.
      Zudem sei Art. 2 GG verletzt, wie das BVerfG, Beschluss vom 5.6.2022 -
      2 BvR 567/22 festgestellt hat. ECLI:DE:BGH:2023:UR20230120.VIIIZR123.22.00
    `;
    const citations = extractCitations(text);
    const caseCitations = citations.filter((c) => c.type === "case");
    const statuteCitations = citations.filter((c) => c.type === "statute");

    expect(caseCitations.length).toBeGreaterThanOrEqual(2);
    expect(statuteCitations.length).toBeGreaterThanOrEqual(2);

    // Should contain BGB and GG statute citations
    expect(statuteCitations.some((c) => c.statute === "BGB")).toBe(true);
    expect(statuteCitations.some((c) => c.reference.includes("GG"))).toBe(true);

    // Should contain BGH and BVerfG case citations
    expect(caseCitations.some((c) => c.reference.includes("BGH"))).toBe(true);
    expect(caseCitations.some((c) => c.reference.includes("BVerfG"))).toBe(true);
  });
});
