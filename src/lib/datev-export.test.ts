// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  csvCell,
  steuerKennzeichen,
  generateDatevCsv,
  AREA_CODES,
  KONTENRAHMEN,
  DATEV_CSV_HEADER,
  type ExportEntry,
} from "./datev-export";

const sampleEntries: ExportEntry[] = [
  {
    id: "1",
    date: "2026-06-01",
    caseNumber: "AZ-001",
    description: "Beratung Vertragsrecht",
    hours: 2.5,
    rate: 200,
    amount: 500,
    client: "Acme GmbH",
    legalArea: "Vertragsrecht",
    invoiceNumber: "R-2026-0001",
    kind: "time",
  },
  {
    id: "2",
    date: "2026-06-15",
    caseNumber: "AZ-002",
    description: "Gerichtskosten Auslage",
    rate: 0,
    amount: 75.5,
    client: "Müller GmbH",
    legalArea: "Prozessrecht",
    kind: "expense",
  },
];

const sampleSettings = {
  datevKontenrahmen: "SKR03" as const,
  datevBeraterNr: "12345",
  datevMandantenNr: "67890",
  ustId: "DE123456789",
};

describe("csvCell", () => {
  test("einfacher String ohne Sonderzeichen → unverändert", () => {
    expect(csvCell("Hallo")).toBe("Hallo");
  });

  test("Zahl → String", () => {
    expect(csvCell(42)).toBe("42");
  });

  test("undefined → leerer String", () => {
    expect(csvCell(undefined)).toBe("");
  });

  test("Semikolon → wird gequoted", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
  });

  test("Anführungszeichen → wird gedoppelt + gequoted", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  test("Zeilenumbruch → wird gequoted", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  test("Carriage Return → wird gequoted", () => {
    expect(csvCell("a\rb")).toBe('"a\rb"');
  });

  test("leerer String → unverändert (kein Quoting nötig)", () => {
    expect(csvCell("")).toBe("");
  });

  test("Unicode (Umlaute, €) → unverändert", () => {
    expect(csvCell("Müller — Köln €")).toBe("Müller — Köln €");
  });
});

describe("steuerKennzeichen", () => {
  test("19 % DE → '19'", () => {
    expect(steuerKennzeichen(0.19)).toBe("19");
  });

  test("20 % AT → '20'", () => {
    expect(steuerKennzeichen(0.2)).toBe("20");
  });

  test("0 % → '0'", () => {
    expect(steuerKennzeichen(0)).toBe("0");
  });

  test("7 % (ermäßigt) → '0' (nicht abgedeckt)", () => {
    expect(steuerKennzeichen(0.07)).toBe("0");
  });
});

describe("AREA_CODES", () => {
  test("alle Rechtsgebiete haben Kostenstelle", () => {
    expect(AREA_CODES["Vertragsrecht"]).toBe("1300");
    expect(AREA_CODES["Prozessrecht"]).toBe("1200");
    expect(AREA_CODES["Arbeitsrecht"]).toBe("1400");
    expect(AREA_CODES["Datenschutz"]).toBe("1500");
    expect(AREA_CODES["Steuerrecht"]).toBe("1700");
    expect(AREA_CODES["Allgemein"]).toBe("1100");
  });

  test("unbekanntes Rechtsgebiet → Default '1100' in generateDatevCsv", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      legalArea: "UnbekanntesGebiet",
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("1100");
  });
});

describe("KONTENRAHMEN", () => {
  test("SKR03 hat korrekte Konten", () => {
    expect(KONTENRAHMEN.SKR03.honorarKonto).toBe("8400");
    expect(KONTENRAHMEN.SKR03.auslagenKonto).toBe("4900");
    expect(KONTENRAHMEN.SKR03.ustKonto).toBe("1776");
  });

  test("SKR04 hat korrekte Konten", () => {
    expect(KONTENRAHMEN.SKR04.honorarKonto).toBe("4400");
    expect(KONTENRAHMEN.SKR04.auslagenKonto).toBe("6300");
    expect(KONTENRAHMEN.SKR04.ustKonto).toBe("3806");
  });

  test("SKR49 (AT) hat korrekte Konten", () => {
    expect(KONTENRAHMEN.SKR49.honorarKonto).toBe("4400");
    expect(KONTENRAHMEN.SKR49.auslagenKonto).toBe("4900");
    expect(KONTENRAHMEN.SKR49.ustKonto).toBe("2776");
  });
});

describe("generateDatevCsv — Header & Struktur", () => {
  test("CSV-Header ist kanonisch", () => {
    expect(DATEV_CSV_HEADER).toBe(
      "USt-ID;Datum;Belegnr;Buchungstext;Konto;Gegenkonto;Betrag;Steuerkennzeichen;Kostenstelle;Mandant;Stunden;Typ;Berater;Mandant-Nr"
    );
  });

  test("erste Zeile ist Header", () => {
    const csv = generateDatevCsv([], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv.split("\n")[0]).toBe(DATEV_CSV_HEADER);
  });

  test("leere Entries → nur Header", () => {
    const csv = generateDatevCsv([], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toBe(DATEV_CSV_HEADER);
  });
});

describe("generateDatevCsv — Datumskonvertierung", () => {
  test("ISO-Datum → DD.MM.YYYY", () => {
    const csv = generateDatevCsv([sampleEntries[0]], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("01.06.2026");
  });

  test("Datum mit einstelligen Tagen/Monaten → mit führender Null", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      date: "2026-03-05",
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("05.03.2026");
  });
});

describe("generateDatevCsv — Betragsformat", () => {
  test("Betrag mit Komma als Dezimaltrennzeichen", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      amount: 1234.56,
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("1234,56");
  });

  test("Betrag 0 → '0,00'", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      amount: 0,
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("0,00");
  });

  test("Stunden mit Komma als Dezimaltrennzeichen", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      hours: 2.5,
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("2,50");
  });

  test("Auslage hat 0 Stunden", () => {
    const csv = generateDatevCsv([sampleEntries[1]], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("0,00");
  });
});

describe("generateDatevCsv — Kontenrahmen", () => {
  test("SKR03: Honorar → Konto 8400, Gegenkonto 1776", () => {
    const csv = generateDatevCsv([sampleEntries[0]], sampleSettings, "2026-01-01", "2026-12-31");
    const row = csv.split("\n")[1];
    expect(row).toContain("8400");
    expect(row).toContain("1776");
  });

  test("SKR03: Auslage → Konto 4900", () => {
    const csv = generateDatevCsv([sampleEntries[1]], sampleSettings, "2026-01-01", "2026-12-31");
    const row = csv.split("\n")[1];
    expect(row).toContain("4900");
  });

  test("SKR04: Honorar → Konto 4400, Gegenkonto 3806", () => {
    const csv = generateDatevCsv(
      [sampleEntries[0]],
      { ...sampleSettings, datevKontenrahmen: "SKR04" },
      "2026-01-01",
      "2026-12-31"
    );
    const row = csv.split("\n")[1];
    expect(row).toContain("4400");
    expect(row).toContain("3806");
  });

  test("SKR49 (AT): Honorar → Konto 4400, Gegenkonto 2776", () => {
    const csv = generateDatevCsv(
      [sampleEntries[0]],
      { ...sampleSettings, datevKontenrahmen: "SKR49" },
      "2026-01-01",
      "2026-12-31"
    );
    const row = csv.split("\n")[1];
    expect(row).toContain("4400");
    expect(row).toContain("2776");
  });

  test("Default SKR03 bei fehlendem Kontenrahmen", () => {
    const csv = generateDatevCsv(
      [sampleEntries[0]],
      { ...sampleSettings, datevKontenrahmen: undefined },
      "2026-01-01",
      "2026-12-31"
    );
    const row = csv.split("\n")[1];
    expect(row).toContain("8400");
  });

  test("Default SKR03 bei null settings", () => {
    const csv = generateDatevCsv([sampleEntries[0]], null, "2026-01-01", "2026-12-31");
    const row = csv.split("\n")[1];
    expect(row).toContain("8400");
  });
});

describe("generateDatevCsv — Zeitraum-Filter", () => {
  test("Eintrag außerhalb des Zeitraums wird gefiltert", () => {
    const csv = generateDatevCsv([sampleEntries[0]], sampleSettings, "2026-07-01", "2026-12-31");
    // Nur Header, kein Eintrag
    expect(csv.split("\n")).toHaveLength(1);
  });

  test("Eintrag genau am Start-Datum wird eingeschlossen", () => {
    const entry: ExportEntry = { ...sampleEntries[0], date: "2026-06-01" };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-06-01", "2026-12-31");
    expect(csv.split("\n")).toHaveLength(2);
  });

  test("Eintrag genau am End-Datum wird eingeschlossen", () => {
    const entry: ExportEntry = { ...sampleEntries[0], date: "2026-06-30" };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-06-30");
    expect(csv.split("\n")).toHaveLength(2);
  });

  test("Mehrere Entries — nur die im Zeitraum werden exportiert", () => {
    const entries: ExportEntry[] = [
      { ...sampleEntries[0], date: "2026-05-15" },
      { ...sampleEntries[0], date: "2026-06-15" },
      { ...sampleEntries[0], date: "2026-07-15" },
    ];
    const csv = generateDatevCsv(entries, sampleSettings, "2026-06-01", "2026-06-30");
    // Header + 1 Eintrag
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("15.06.2026");
  });
});

describe("generateDatevCsv — Belegnummer", () => {
  test("Rechnungsnummer wird als Belegnr verwendet", () => {
    const csv = generateDatevCsv([sampleEntries[0]], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("R-2026-0001");
  });

  test("Fehlende Rechnungsnummer → Aktenzeichen als Belegnr", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      invoiceNumber: undefined,
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("AZ-001");
  });
});

describe("generateDatevCsv — Typ-Feld", () => {
  test("Zeit-Eintrag → 'Honorar'", () => {
    const csv = generateDatevCsv([sampleEntries[0]], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("Honorar");
  });

  test("Auslagen-Eintrag → 'Auslage'", () => {
    const csv = generateDatevCsv([sampleEntries[1]], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("Auslage");
  });
});

describe("generateDatevCsv — Kostenstelle", () => {
  test("Vertragsrecht → 1300", () => {
    const csv = generateDatevCsv([sampleEntries[0]], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("1300");
  });

  test("Prozessrecht → 1200", () => {
    const csv = generateDatevCsv([sampleEntries[1]], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("1200");
  });
});

describe("generateDatevCsv — Berater- & Mandant-Nr", () => {
  test("BeraterNr und MandantenNr erscheinen in jeder Zeile", () => {
    const csv = generateDatevCsv([sampleEntries[0]], sampleSettings, "2026-01-01", "2026-12-31");
    const row = csv.split("\n")[1];
    expect(row).toContain("12345");
    expect(row).toContain("67890");
  });

  test("Fehlende BeraterNr → leerer String", () => {
    const csv = generateDatevCsv(
      [sampleEntries[0]],
      { ...sampleSettings, datevBeraterNr: undefined },
      "2026-01-01",
      "2026-12-31"
    );
    const row = csv.split("\n")[1];
    // Berater-Feld ist leer (zweiter Wert von rechts)
    const cells = row.split(";");
    expect(cells[12]).toBe("");
  });
});

describe("generateDatevCsv — USt-ID", () => {
  test("USt-ID erscheint in jeder Zeile", () => {
    const csv = generateDatevCsv([sampleEntries[0]], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("DE123456789");
  });

  test("Fehlende USt-ID → leerer String", () => {
    const csv = generateDatevCsv(
      [sampleEntries[0]],
      { ...sampleSettings, ustId: undefined },
      "2026-01-01",
      "2026-12-31"
    );
    const row = csv.split("\n")[1];
    const cells = row.split(";");
    expect(cells[0]).toBe("");
  });
});

describe("generateDatevCsv — CSV-Injection-Schutz", () => {
  test("Beschreibung mit Semikolon → wird gequoted", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      description: "Beratung; Vertragsrecht",
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain('"Beratung; Vertragsrecht"');
  });

  test("Beschreibung mit Anführungszeichen → wird gedoppelt + gequoted", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      description: 'Beratung "wichtig"',
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain('"Beratung ""wichtig"""');
  });

  test("Client-Name mit Semikolon → wird gequoted", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      client: "Firma A; GmbH",
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain('"Firma A; GmbH"');
  });
});

describe("generateDatevCsv — Edge Cases", () => {
  test("Unicode in Beschreibung und Client", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      description: "Beratung zum Urheberrecht § 97",
      client: "Müller & Söhne GmbH — Köln €",
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("§ 97");
    expect(csv).toContain("Müller & Söhne GmbH — Köln €");
  });

  test("viele Entries (50) → alle erscheinen im CSV", () => {
    const entries: ExportEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `entry-${i}`,
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      caseNumber: `AZ-${String(i + 1).padStart(3, "0")}`,
      description: `Leistung ${i + 1}`,
      hours: 1,
      rate: 200,
      amount: 200,
      client: `Client ${i + 1}`,
      legalArea: "Allgemein",
      kind: "time" as const,
    }));
    const csv = generateDatevCsv(entries, sampleSettings, "2026-01-01", "2026-12-31");
    // Header + 50 Einträge
    expect(csv.split("\n")).toHaveLength(51);
  });

  test("deterministisch — gleiche Eingabe → gleiche Ausgabe", () => {
    const csv1 = generateDatevCsv(sampleEntries, sampleSettings, "2026-01-01", "2026-12-31");
    const csv2 = generateDatevCsv(sampleEntries, sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv1).toBe(csv2);
  });

  test("Reihenfolge der Entries wird beibehalten", () => {
    const csv = generateDatevCsv(sampleEntries, sampleSettings, "2026-01-01", "2026-12-31");
    const lines = csv.split("\n");
    // Erster Eintrag: Beratung Vertragsrecht (01.06.2026)
    expect(lines[1]).toContain("01.06.2026");
    // Zweiter Eintrag: Gerichtskosten (15.06.2026)
    expect(lines[2]).toContain("15.06.2026");
  });
});

// ── Erweiterte Regressionstests (P0-DACH-002) ────────────────────────

describe("steuerKennzeichen — erweiterte Edge Cases", () => {
  test("negative Rate → '0'", () => {
    expect(steuerKennzeichen(-0.1)).toBe("0");
  });

  test("genau 0.195 → '19'", () => {
    expect(steuerKennzeichen(0.195)).toBe("19");
  });

  test("0.199 → '19'", () => {
    expect(steuerKennzeichen(0.199)).toBe("19");
  });

  test("0.20 → '20'", () => {
    expect(steuerKennzeichen(0.2)).toBe("20");
  });

  test("0.25 (über AT-Satz) → '20'", () => {
    expect(steuerKennzeichen(0.25)).toBe("20");
  });

  test("sehr kleine positive Rate (0.01) → '0'", () => {
    expect(steuerKennzeichen(0.01)).toBe("0");
  });
});

describe("generateDatevCsv — SKR04/SKR49 Auslagenkonten", () => {
  test("SKR04: Auslage → Konto 6300", () => {
    const csv = generateDatevCsv(
      [sampleEntries[1]],
      { ...sampleSettings, datevKontenrahmen: "SKR04" },
      "2026-01-01",
      "2026-12-31"
    );
    const fields = csv.split("\n")[1].split(";");
    expect(fields[4]).toBe("6300");
  });

  test("SKR49: Auslage → Konto 4900", () => {
    const csv = generateDatevCsv(
      [sampleEntries[1]],
      { ...sampleSettings, datevKontenrahmen: "SKR49" },
      "2026-01-01",
      "2026-12-31"
    );
    const fields = csv.split("\n")[1].split(";");
    expect(fields[4]).toBe("4900");
  });
});

describe("generateDatevCsv — Ungültiger Kontenrahmen", () => {
  test("unbekannter Kontenrahmen → SKR03 Default", () => {
    const csv = generateDatevCsv(
      [sampleEntries[0]],
      { ...sampleSettings, datevKontenrahmen: "INVALID" },
      "2026-01-01",
      "2026-12-31"
    );
    const fields = csv.split("\n")[1].split(";");
    expect(fields[4]).toBe("8400");
    expect(fields[5]).toBe("1776");
  });
});

describe("generateDatevCsv — Gemischte Entries", () => {
  test("Time + Expense in einem Export", () => {
    const csv = generateDatevCsv(sampleEntries, sampleSettings, "2026-01-01", "2026-12-31");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Honorar");
    expect(lines[2]).toContain("Auslage");
  });

  test("Time + Expense haben unterschiedliche Konten (SKR03)", () => {
    const csv = generateDatevCsv(sampleEntries, sampleSettings, "2026-01-01", "2026-12-31");
    const lines = csv.split("\n");
    const timeFields = lines[1].split(";");
    const expenseFields = lines[2].split(";");
    expect(timeFields[4]).toBe("8400"); // honorar
    expect(expenseFields[4]).toBe("4900"); // auslagen
  });
});

describe("generateDatevCsv — Newline in Beschreibung", () => {
  test("Zeilenumbruch in Beschreibung wird gequoted", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      description: "Zeile 1\nZeile 2",
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain('"Zeile 1\nZeile 2"');
  });
});

describe("generateDatevCsv — Single-Day Period", () => {
  test("Periode von = bis = ein Tag", () => {
    const entry: ExportEntry = { ...sampleEntries[0], date: "2026-06-15" };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-06-15", "2026-06-15");
    expect(csv.split("\n")).toHaveLength(2);
  });
});

describe("generateDatevCsv — Leeres Rechtsgebiet", () => {
  test("leerer legalArea → Default 1100", () => {
    const entry: ExportEntry = { ...sampleEntries[0], legalArea: "" };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    const fields = csv.split("\n")[1].split(";");
    expect(fields[8]).toBe("1100");
  });
});

describe("generateDatevCsv — Große Beträge", () => {
  test("Betrag > 100.000 €", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      amount: 123456.78,
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("123456,78");
  });
});

describe("generateDatevCsv — Fehlende Stunden bei Time-Entry", () => {
  test("hours undefined → 0,00", () => {
    const entry: ExportEntry = {
      ...sampleEntries[0],
      hours: undefined,
    };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    expect(csv).toContain("0,00");
  });
});

describe("generateDatevCsv — Alle Kostenstellen abgedeckt", () => {
  test("Arbeitsrecht → 1400", () => {
    const entry: ExportEntry = { ...sampleEntries[0], legalArea: "Arbeitsrecht" };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    const fields = csv.split("\n")[1].split(";");
    expect(fields[8]).toBe("1400");
  });

  test("Datenschutz → 1500", () => {
    const entry: ExportEntry = { ...sampleEntries[0], legalArea: "Datenschutz" };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    const fields = csv.split("\n")[1].split(";");
    expect(fields[8]).toBe("1500");
  });

  test("Steuerrecht → 1700", () => {
    const entry: ExportEntry = { ...sampleEntries[0], legalArea: "Steuerrecht" };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    const fields = csv.split("\n")[1].split(";");
    expect(fields[8]).toBe("1700");
  });

  test("Allgemein → 1100", () => {
    const entry: ExportEntry = { ...sampleEntries[0], legalArea: "Allgemein" };
    const csv = generateDatevCsv([entry], sampleSettings, "2026-01-01", "2026-12-31");
    const fields = csv.split("\n")[1].split(";");
    expect(fields[8]).toBe("1100");
  });
});

describe("generateDatevCsv — Leere Settings", () => {
  test("leeres Settings-Objekt → SKR03 Defaults, leere Felder", () => {
    const csv = generateDatevCsv([sampleEntries[0]], {}, "2026-01-01", "2026-12-31");
    const fields = csv.split("\n")[1].split(";");
    expect(fields[0]).toBe(""); // USt-ID
    expect(fields[4]).toBe("8400"); // SKR03 honorar
    expect(fields[12]).toBe(""); // Berater
    expect(fields[13]).toBe(""); // Mandant-Nr
  });
});

describe("generateDatevCsv — Spaltenanzahl konsistent", () => {
  test("jede Datenzeile hat 14 Spalten", () => {
    const csv = generateDatevCsv(sampleEntries, sampleSettings, "2026-01-01", "2026-12-31");
    const lines = csv.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const fields = lines[i].split(";");
      expect(fields).toHaveLength(14);
    }
  });

  test("Header hat 14 Spalten", () => {
    const headerFields = DATEV_CSV_HEADER.split(";");
    expect(headerFields).toHaveLength(14);
  });
});
