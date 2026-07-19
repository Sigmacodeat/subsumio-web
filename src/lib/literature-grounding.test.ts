// @vitest-environment node

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { extractLiteratureCitations } from "@/lib/citation-gate-client";
import { groundLiteratureCitations } from "@/lib/legal-grounding";

describe("extractLiteratureCitations", () => {
  test("BT-Drucksache mit Seitenangabe", () => {
    const refs = extractLiteratureCitations(
      "Nach der Gesetzesbegründung (BT-Drs. 19/27873, S. 34) wollte der Gesetzgeber…"
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      kind: "materialien",
      work: "BT-Drs.",
      ref: "19/27873",
      corpusFile: "btd-19-27873",
      corpusDir: "de-materialien",
      pinpoint: "S. 34",
    });
  });

  test("BR-Drs. und Langform BT-Drucksache", () => {
    const refs = extractLiteratureCitations("Vgl. BR-Drs. 123/24 und BT-Drucksache 20/1234.");
    expect(refs.map((r) => r.corpusFile)).toEqual(["brd-123-24", "btd-20-1234"]);
  });

  test("Onlinekommentar Kurz- und Langform", () => {
    const short = extractLiteratureCitations("Siehe OK-ZGB Art. 53 Rn. 5.");
    expect(short[0]).toMatchObject({
      kind: "kommentar_oa",
      corpusFile: "ok-zgb53",
      corpusDir: "ch-literatur",
      pinpoint: "Rn. 5",
    });
    const long = extractLiteratureCitations("Onlinekommentar zu Art. 3 BV, passim.");
    expect(long[0].corpusFile).toBe("ok-bv3");
  });

  test("Verlags-Kommentar wird als licensed_work erkannt, unbekannte Autoren nicht", () => {
    const refs = extractLiteratureCitations(
      "Vgl. Grüneberg, BGB § 433 Rn. 5; a.A. Musterfrau, BGB § 1 Rn. 1."
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ kind: "licensed_work", work: "Grüneberg", corpusFile: null });
  });

  test("Duplikate werden dedupliziert", () => {
    const refs = extractLiteratureCitations("BT-Drs. 19/27873, S. 34 … erneut BT-Drs. 19/27873.");
    expect(refs).toHaveLength(1);
  });
});

describe("groundLiteratureCitations", () => {
  // Synthetische Fixture: Wahlperiode 99 existiert nicht — kollidiert nie mit
  // echten DIP-Importen. Wird nach dem Test entfernt.
  const fixtureDir = path.join(process.cwd(), "law-corpus", "de-materialien");
  const fixtureFile = path.join(fixtureDir, "btd-99-99999.md");

  beforeAll(() => {
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      fixtureFile,
      "---\ntitle: Fixture\ntype: materialien\n---\n\n# BT-Drs. 99/99999\n\nBegründung: Der Entwurf dient der Erprobung der Literatur-Verankerung.\n",
      "utf8"
    );
  });

  afterAll(() => {
    rmSync(fixtureFile, { force: true });
  });

  test("vorhandene Drucksache wird verifiziert (mit source_text)", async () => {
    const refs = extractLiteratureCitations("Vgl. BT-Drs. 99/99999, S. 1.");
    const grounded = await groundLiteratureCitations(refs);
    expect(grounded).toHaveLength(1);
    expect(grounded[0]).toMatchObject({
      verified: true,
      category: "materialien",
      source_file: "de-materialien/btd-99-99999.md",
    });
    expect(grounded[0].source_text).toContain("Erprobung");
  });

  test("fehlende Drucksache bleibt unverifiziert", async () => {
    const refs = extractLiteratureCitations("Vgl. BT-Drs. 98/88888.");
    const grounded = await groundLiteratureCitations(refs);
    expect(grounded[0].verified).toBe(false);
    expect(grounded[0].unverifiable_reason).toContain("nicht im Korpus");
  });

  test("licensed_work verifiziert NIE (fail-closed)", async () => {
    const refs = extractLiteratureCitations("Vgl. Staudinger, BGB § 823 Rn. 44.");
    const grounded = await groundLiteratureCitations(refs);
    expect(grounded[0]).toMatchObject({ verified: false, category: "verlags_literatur" });
    expect(grounded[0].unverifiable_reason).toContain("anwaltlich prüfen");
  });
});
