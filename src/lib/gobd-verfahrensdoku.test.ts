// @vitest-environment node

import { describe, test, expect } from "vitest";
import { buildVerfahrensdoku, type VerfahrensdokuInput } from "./gobd-verfahrensdoku";

const sampleInput: VerfahrensdokuInput = {
  kanzleiName: "Kanzlei Schmidt",
  anwaltName: "Dr. Schmidt",
  ustId: "DE123456789",
  verantwortlich: "Dr. Schmidt",
  systeme: "Subsumio, DATEV",
  belegEingang: "Post und E-Mail",
  erfassung: "Täglich verbucht",
  ablageOrt: "Subsumio Brain",
  backup: "Tägliche Cloud-Backups",
  zugriffsschutz: "Rollenbasiert",
  iks: "Vier-Augen-Prinzip",
  stand: "2026-06-19",
};

describe("buildVerfahrensdoku", () => {
  test("produces markdown with all sections", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("# Verfahrensdokumentation");
    expect(doc).toContain("## 1. Allgemeine Beschreibung");
    expect(doc).toContain("## 2. Anwenderdokumentation");
    expect(doc).toContain("## 3. Technische Systemdokumentation");
    expect(doc).toContain("## 4. Betriebsdokumentation");
    expect(doc).toContain("## 5. Aufbewahrung und Auswertbarkeit");
    expect(doc).toContain("## 6. Änderungshistorie");
  });

  test("contains kanzlei name", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Kanzlei Schmidt");
  });

  test("contains USt-IdNr", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("DE123456789");
  });

  test("contains 10-year retention reference", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("10 Jahre");
    expect(doc).toContain("§ 147 Abs. 3 AO");
  });

  test("contains SHA-256 reference", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("SHA-256");
  });

  test("contains disclaimer about template nature", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Vorlage");
    expect(doc).toContain("pr\u00fcfen");
  });

  test("empty fields get placeholder", () => {
    const doc = buildVerfahrensdoku({
      ...sampleInput,
      backup: "",
      iks: "",
    });
    expect(doc).toContain("_[bitte erg\u00e4nzen / vom Berater pr\u00fcfen lassen]_");
  });

  test("Änderungshistorie table has entry", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("| 2026-06-19 | 1.0 | Ersterstellung");
  });

  test("is a pure function — same input → same output", () => {
    const doc1 = buildVerfahrensdoku(sampleInput);
    const doc2 = buildVerfahrensdoku(sampleInput);
    expect(doc1).toBe(doc2);
  });
});
