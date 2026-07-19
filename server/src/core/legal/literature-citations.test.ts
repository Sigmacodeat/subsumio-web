import { describe, expect, test } from "bun:test";
import { extractLiteratureReferences, literatureGroundingHint } from "./literature-citations.ts";

describe("extractLiteratureReferences", () => {
  test("BT-Drucksache mit Seitenangabe", () => {
    const refs = extractLiteratureReferences(
      "Nach der Gesetzesbegründung (BT-Drs. 19/27873, S. 34) wollte der Gesetzgeber…"
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      kind: "materialien",
      slug: "legal/materialien/de/btd-19-27873",
      jurisdiction: "de",
      pinpoint: "S. 34",
    });
  });

  test("BR-Drucksache ohne Seite, Langform BT-Drucksache", () => {
    const refs = extractLiteratureReferences("Vgl. BR-Drs. 123/24 sowie BT-Drucksache 20/1234.");
    expect(refs.map((r) => r.slug)).toEqual([
      "legal/materialien/de/brd-123-24",
      "legal/materialien/de/btd-20-1234",
    ]);
  });

  test("Onlinekommentar Kurzform mit Rn.", () => {
    const refs = extractLiteratureReferences("Siehe OK-ZGB Art. 53 Rn. 5.");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      kind: "kommentar_oa",
      slug: "legal/literatur/ch/ok-zgb53",
      jurisdiction: "ch",
      pinpoint: "Rn. 5",
    });
  });

  test("Onlinekommentar Langform", () => {
    const refs = extractLiteratureReferences("Onlinekommentar zu Art. 3 BV, passim.");
    expect(refs).toHaveLength(1);
    expect(refs[0].slug).toBe("legal/literatur/ch/ok-bv3");
  });

  test("Onlinekommentar: unbekanntes Gesetz produziert keinen Slug", () => {
    const refs = extractLiteratureReferences("OK-XYZ Art. 1 Rn. 1");
    expect(refs).toHaveLength(0);
  });

  test("Verlags-Kommentar wird erkannt, aber NICHT aufgelöst (fail-closed)", () => {
    const refs = extractLiteratureReferences("Vgl. Grüneberg, BGB § 433 Rn. 5.");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ kind: "licensed_work", slug: null, work: "Grüneberg" });
    expect(literatureGroundingHint(refs[0])).toContain("nicht im freien Korpus");
  });

  test("unbekannter Autorname triggert keine licensed_work-Erkennung", () => {
    const refs = extractLiteratureReferences("Vgl. Musterfrau, BGB § 1 Rn. 1.");
    expect(refs).toHaveLength(0);
  });

  test("Duplikate werden dedupliziert", () => {
    const refs = extractLiteratureReferences(
      "BT-Drs. 19/27873, S. 34 … und nochmal BT-Drs. 19/27873, S. 34."
    );
    expect(refs).toHaveLength(1);
  });

  test("gemischter Text extrahiert alle drei Klassen", () => {
    const refs = extractLiteratureReferences(
      "Die Begründung (BT-Drs. 20/5555, S. 12) und OK-OR Art. 41 Rn. 3 stützen dies; " +
        "a.A. Staudinger, BGB § 823 Rn. 44."
    );
    expect(refs.map((r) => r.kind).sort()).toEqual([
      "kommentar_oa",
      "licensed_work",
      "materialien",
    ]);
  });
});
