// @vitest-environment node

import { describe, test, expect } from "vitest";
import { buildVerfahrensdoku, type VerfahrensdokuInput } from "./gobd-verfahrensdoku";

const sampleInput: VerfahrensdokuInput = {
  kanzleiName: "Kanzlei Schmidt",
  anwaltName: "Dr. Schmidt",
  ustId: "ATU12345678",
  verantwortlich: "Dr. Schmidt",
  systeme: "Subsumio, Buchhaltungssoftware",
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

  test("contains UID-Nummer", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("UID-Nummer");
    expect(doc).toContain("ATU12345678");
  });

  test("contains 7-year retention reference (§ 132 BAO)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("7 Jahre");
    expect(doc).toContain("§ 132 BAO");
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
  test("enthält § 131 BAO (Unveränderbarkeit der Aufzeichnungen)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("§ 131 BAO");
  });

  test("beschreibt die Unveränderbarkeit über eine Prüfsumme", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Unveränderbarkeit");
    expect(doc).toContain("Prüfsumme");
  });

  test("Titel ohne GoBD-Zusatz (Österreich)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("# Verfahrensdokumentation zur ordnungsmäßigen Beleg- und Buchführung\n");
  });

  test("enthält keine deutschen Rechtsgrundlagen (GoBD, AO, DATEV)", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).not.toMatch(/GoBD|§ 14[67]\b|\bAO\b|DATEV/);
  });

  test("IKS-Abschnitt verweist auf § 131 BAO", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    const iks = doc.split("### 4.3 Internes Kontrollsystem (IKS)")[1].split("## 5.")[0];
    expect(iks).toContain("§ 131 BAO");
  });

  test("enthält Referenz auf den Export der Buchungsdaten", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Export der Buchungsdaten");
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

  test('Sonderzeichen in Kanzleinamen (&, <, >, ")', () => {
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
      erfassung: "Täglich — Verbuchung in der Buchhaltungssoftware",
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
    expect(doc).toContain("ATU12345678");
    expect(doc).toContain("Subsumio, Buchhaltungssoftware");
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

  test("Sektion 5 (Aufbewahrung) erwähnt 7 Jahre und § 132 BAO", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    const section5 = doc.split("## 5. Aufbewahrung und Auswertbarkeit")[1].split("## 6.")[0];
    expect(section5).toContain("7 Jahre");
    expect(section5).toContain("§ 132 BAO");
  });

  test("Footer enthält Subsumio-Referenz und Haftungsausschluss", () => {
    const doc = buildVerfahrensdoku(sampleInput);
    expect(doc).toContain("Generiert mit Subsumio");
    expect(doc).toContain("ersetzt keine steuerliche oder");
    expect(doc).toContain("rechtliche Beratung");
  });
});
