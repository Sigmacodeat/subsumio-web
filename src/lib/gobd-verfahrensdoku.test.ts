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

describe("buildVerfahrensdoku — Rechtliche Referenzen", () => {
  test("enthält § 146 Abs. 4 AO (Manipulations-Evidenz)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("§ 146 Abs. 4 AO");
  });

  test("enthält GoBD Rz. 107 (Unveränderbarkeit)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("GoBD Rz. 107");
  });

  test("enthält GoBD Rz. 151 (Verfahrensdokumentation)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("GoBD Rz. 151");
  });

  test("enthält GoBD Rz. 126 (maschinelle Auswertbarkeit)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("GoBD Rz. 126");
  });

  test("enthält GoBD Rz. 100 (IKS)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("GoBD Rz. 100");
  });

  test("enthält Referenz auf DATEV-kompatiblen Export", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("DATEV");
  });

  test("enthält 'maschinell auswertbar' Begriff", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("maschinell auswertbar");
  });
});

describe("buildVerfahrensdoku — Edge Cases", () => {
  test("alle Felder leer → alle Platzhalter", () => {
    const emptyInput: VerfahrensdokuInput = {
      kanzleiName: "",
      anwaltName: "",
      ustId: "",
      verantwortlich: "",
      systeme: "",
      belegEingang: "",
      erfassung: "",
      ablageOrt: "",
      backup: "",
      zugriffsschutz: "",
      iks: "",
      stand: "",
    };
    const doc = buildVerfahrensdoku(emptyInput);
    // Mehrere Platzhalter sollten vorhanden sein
    const placeholderCount = (doc.match(/bitte ergänzen/g) ?? []).length;
    expect(placeholderCount).toBeGreaterThanOrEqual(8);
  });

  test("Whitespace-only Felder → Platzhalter", () => {
    const doc = buildVerfahrensdoku({
      ...sampleInput,
      kanzleiName: "   ",
      backup: "\t\n",
    });
    expect(doc).toContain("_[bitte ergänzen / vom Berater prüfen lassen]_");
  });

  test("Sonderzeichen in Kanzleinamen (&, <, >, \")", () => {
    const doc = buildVerfahrensdoku({
      ...sampleInput,
      kanzleiName: 'Müller & Söhne <Rechtsanwälte> "GmbH"',
    });
    expect(doc).toContain('Müller & Söhne <Rechtsanwälte> "GmbH"');
  });

  test("Umlaute und Unicode in allen Feldern", () => {
    const doc = buildVerfahrensdoku({
      ...sampleInput,
      kanzleiName: "Kanzlei Müller — Köln €",
      belegEingang: "E-Mail: post@müller-köln.de — Upload über Portal",
      erfassung: "Täglich — Verbuchung mit DATEV",
    });
    expect(doc).toContain("Müller — Köln €");
    expect(doc).toContain("post@müller-köln.de");
    expect(doc).toContain("Täglich");
  });

  test("Stand-Datum erscheint im Dokument", () => {
    const doc = buildVerfahrensdoku({ ...sampleInput, stand: "2025-01-15" });
    expect(doc).toContain("2025-01-15");
  });

  test("Verantwortlich erscheint in Änderungshistorie", () => {
    const doc = buildVerfahrensdoku({ ...sampleInput, verantwortlich: "RA Dr. Meier" });
    expect(doc).toContain("RA Dr. Meier");
  });

  test("alle Eingabefelder erscheinen im Output", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Kanzlei Schmidt");
    expect(doc).toContain("Dr. Schmidt");
    expect(doc).toContain("DE123456789");
    expect(doc).toContain("Subsumio, DATEV");
    expect(doc).toContain("Post und E-Mail");
    expect(doc).toContain("Täglich verbucht");
    expect(doc).toContain("Subsumio Brain");
    expect(doc).toContain("Tägliche Cloud-Backups");
    expect(doc).toContain("Rollenbasiert");
    expect(doc).toContain("Vier-Augen-Prinzip");
    expect(doc).toContain("2026-06-19");
  });

  test("Dokument beginnt mit '# Verfahrensdokumentation'", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc.startsWith("# Verfahrensdokumentation")).toBe(true);
  });

  test("enthält 'Entwurf' Warnung", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Entwurf");
  });

  test("enthält 'Subsumio' Referenz", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Subsumio");
  });

  test("technische Systemdokumentation hat Platzhalter für Hardware/Schnittstellen", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    // Section 3 hat immer einen Platzhalter für technische Details
    expect(doc).toContain("## 3. Technische Systemdokumentation");
    // Der Platzhalter erscheint nach den eingesetzten Systemen
    const section3 = doc.split("## 3. Technische Systemdokumentation")[1].split("## 4.")[0];
    expect(section3).toContain("_[bitte ergänzen / vom Berater prüfen lassen]_");
  });

  test("Änderungshistorie hat Tabellenformat", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("| Datum | Version | Änderung | Verantwortlich |");
    expect(doc).toContain("|---|---|---|---|");
  });

  test("Sektion 5 (Aufbewahrung) erwähnt 10 Jahre und § 147", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    const section5 = doc.split("## 5. Aufbewahrung und Auswertbarkeit")[1].split("## 6.")[0];
    expect(section5).toContain("10 Jahre");
    expect(section5).toContain("§ 147 Abs. 3 AO");
  });

  test("Footer enthält Subsumio-Referenz und Haftungsausschluss", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Generiert mit Subsumio");
    expect(doc).toContain("ersetzt keine steuerliche oder");
    expect(doc).toContain("rechtliche Beratung");
  });
});
