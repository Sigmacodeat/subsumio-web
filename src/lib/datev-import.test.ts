import { describe, test, expect } from "vitest";
import {
  parseDatevCsv,
  validateDatevImport,
  buildDatevImportBundle,
  type DatevImportResult,
} from "./datev-import";

const HEADER =
  "USt-ID;Datum;Belegnr;Buchungstext;Konto;Gegenkonto;Betrag;Steuerkennzeichen;Kostenstelle;Mandant;Stunden;Typ;Berater;Mandant-Nr";

function row(overrides: Partial<Record<number, string>> = {}): string {
  const cells = [
    "AT123456",
    "15.06.2024",
    "B001",
    "Honorar Mandat Müller",
    "8400", // SKR03 Erlöskonto
    "17100", // SKR03 Bank
    "1.234,56",
    "20",
    "K1",
    "M001",
    "2,5",
    "RE",
    "JS",
    "10001",
  ];
  for (const [i, v] of Object.entries(overrides)) {
    if (v !== undefined) cells[Number(i)] = v;
  }
  return cells.join(";");
}

function result(entries: Partial<ReturnType<typeof mkEntry>>[] = []): DatevImportResult {
  return {
    entries: entries.map(mkEntry),
    errors: [],
    total_count: entries.length,
    valid_count: entries.length,
    error_count: 0,
  };
}

function mkEntry(overrides = {}) {
  return {
    date: "2024-06-15",
    belegnr: "B001",
    buchungstext: "Honorar",
    konto: "8400",
    gegenkonto: "17100",
    betrag: 1234.56,
    steuerkennzeichen: "20",
    kostenstelle: "K1",
    mandant: "M001",
    stunden: 2.5,
    typ: "RE",
    berater: "JS",
    mandantNr: "10001",
    ...overrides,
  };
}

describe("parseDatevCsv", () => {
  test("leerer Input → leeres Ergebnis ohne Fehler", () => {
    const r = parseDatevCsv("");
    // trim() auf "" ergibt [""] — eine Zeile, headerMatch schlaegt fehl
    // (kein echter Header). total_count = lines-1 = 0.
    expect(r.valid_count).toBe(0);
    expect(r.entries).toHaveLength(0);
  });

  test("Header-Mismatch → error row 0, keine Eintraege", () => {
    const r = parseDatevCsv("foo;bar;baz\n" + row());
    expect(r.error_count).toBe(1);
    expect(r.errors[0]!.row).toBe(0);
    expect(r.errors[0]!.error).toContain("Header mismatch");
    expect(r.entries).toHaveLength(0);
  });

  test("gueltige Zeile → Entry mit ISO-Datum und deutschem Zahlenformat", () => {
    const r = parseDatevCsv(HEADER + "\n" + row());
    expect(r.error_count).toBe(0);
    expect(r.valid_count).toBe(1);
    const e = r.entries[0]!;
    expect(e.date).toBe("2024-06-15");
    expect(e.betrag).toBe(1234.56); // „1.234,56" → 1234.56
    expect(e.stunden).toBe(2.5); // „2,5" → 2.5
    expect(e.belegnr).toBe("B001");
    expect(e.mandantNr).toBe("10001");
  });

  test("zweistelliges Jahr wird zu 20xx expandiert", () => {
    const r = parseDatevCsv(HEADER + "\n" + row({ 1: "5.3.24" }));
    expect(r.entries[0]!.date).toBe("2024-03-05");
  });

  test("ungueltiges Datum → Zeilenfehler, Eintrag faellt weg", () => {
    const r = parseDatevCsv(HEADER + "\n" + row({ 1: "2024-06-15" }));
    expect(r.error_count).toBe(1);
    expect(r.errors[0]!.error).toContain("Invalid date format");
    expect(r.valid_count).toBe(0);
  });

  test("zu wenige Spalten → Zeilenfehler", () => {
    const r = parseDatevCsv(HEADER + "\n" + "a;b;c");
    expect(r.errors[0]!.error).toContain("Expected 14 columns, got 3");
  });

  test("Leerzeilen werden uebersprungen", () => {
    const r = parseDatevCsv(HEADER + "\n\n" + row() + "\n\n");
    expect(r.valid_count).toBe(1);
  });

  test("period_from/period_to = min/max der Eintragsdaten", () => {
    const r = parseDatevCsv(
      HEADER +
        "\n" +
        row({ 1: "15.06.2024" }) +
        "\n" +
        row({ 1: "01.01.2024", 2: "B002" }) +
        "\n" +
        row({ 1: "31.12.2024", 2: "B003" })
    );
    expect(r.period_from).toBe("2024-01-01");
    expect(r.period_to).toBe("2024-12-31");
  });

  test("Kontenrahmen-Erkennung: SKR03 / SKR04 / SKR49", () => {
    const skr03 = parseDatevCsv(HEADER + "\n" + row({ 4: "8400", 5: "17100" }));
    expect(skr03.kontenrahmen).toBe("SKR03");
    const skr04 = parseDatevCsv(HEADER + "\n" + row({ 4: "4400", 5: "38100" }));
    expect(skr04.kontenrahmen).toBe("SKR04");
    const skr49 = parseDatevCsv(HEADER + "\n" + row({ 4: "7000", 5: "27000" }));
    expect(skr49.kontenrahmen).toBe("SKR49");
    const unknown = parseDatevCsv(HEADER + "\n" + row({ 4: "1000", 5: "1000" }));
    expect(unknown.kontenrahmen).toBeUndefined();
  });

  test("Quotes: Semikolon und escapte Anfuehrungszeichen in Feldern", () => {
    const line = row({ 3: '"Honorar; Teil 2 ""korrigiert"""' });
    const r = parseDatevCsv(HEADER + "\n" + line);
    expect(r.entries[0]!.buchungstext).toBe('Honorar; Teil 2 "korrigiert"');
  });

  test("Fehler + gueltige Zeilen koexistieren (best-effort)", () => {
    const r = parseDatevCsv(
      HEADER + "\n" + row() + "\n" + row({ 1: "ungueltig" }) + "\n" + row({ 2: "B002" })
    );
    expect(r.valid_count).toBe(2);
    expect(r.error_count).toBe(1);
    expect(r.total_count).toBe(3);
  });
});

describe("validateDatevImport", () => {
  test("sauberer Import → valid, keine Warnings", () => {
    const v = validateDatevImport(result([{}]));
    expect(v.valid).toBe(true);
    expect(v.warnings).toHaveLength(0);
  });

  test("keine Eintraege → Warning", () => {
    const v = validateDatevImport(result([]));
    expect(v.valid).toBe(false);
    expect(v.warnings).toContain("No valid entries found");
  });

  test("Parse-Fehler → Warning mit Anzahl", () => {
    const r = result([{}]);
    r.error_count = 3;
    r.errors = [
      { row: 1, error: "x" },
      { row: 2, error: "y" },
      { row: 3, error: "z" },
    ];
    const v = validateDatevImport(r);
    expect(v.warnings[0]).toContain("3 row(s)");
  });

  test("gemischte Kontenrahmen SKR03+SKR04 → Warning", () => {
    const v = validateDatevImport(
      result([{ konto: "8400" }, { konto: "1000", gegenkonto: "38100" }])
    );
    expect(v.warnings.some((w) => w.includes("SKR03 + SKR04"))).toBe(true);
  });

  test("SKR49 gemischt mit SKR03/04 → AT/DE-Warning", () => {
    const v = validateDatevImport(
      result([{ konto: "8400" }, { konto: "1000", gegenkonto: "27000" }])
    );
    expect(v.warnings.some((w) => w.includes("AT/DE"))).toBe(true);
  });

  test("negative Betraege → Storno-Warning", () => {
    const v = validateDatevImport(result([{ betrag: -100 }, {}]));
    expect(v.warnings.some((w) => w.includes("negative amounts"))).toBe(true);
  });
});

describe("buildDatevImportBundle", () => {
  const parsed = parseDatevCsv(
    HEADER + "\n" + row() + "\n" + row({ 1: "20.06.2024", 2: "B002", 6: "500,00" })
  );

  test("Import-Page + Booking-Pages mit deterministischen Slugs", () => {
    const b = buildDatevImportBundle(parsed, {
      filename: "buchungen-juni.csv",
      importedAt: "2024-07-01T10:00:00.000Z",
    });
    expect(b.importPage.slug).toBe("legal/datev-imports/20240701100000-buchungen-juni-csv");
    expect(b.bookingPages).toHaveLength(2);
    expect(b.bookingPages[0]!.slug).toContain("booking-0001-b001");
    expect(b.bookingPages[1]!.slug).toContain("booking-0002-b002");
    expect(b.bookingPages[0]!.frontmatter.import_slug).toBe(b.importPage.slug);
  });

  test("Summen im Frontmatter (Betrag + Stunden)", () => {
    const b = buildDatevImportBundle(parsed, {
      filename: "x.csv",
      importedAt: "2024-07-01T10:00:00.000Z",
    });
    expect(b.importPage.frontmatter.total_amount).toBe(1734.56);
    expect(b.importPage.frontmatter.total_hours).toBe(5);
    expect(b.importPage.frontmatter.valid_count).toBe(2);
  });

  test("Booking-Content enthaelt alle Felder lesbar", () => {
    const b = buildDatevImportBundle(parsed, {
      filename: "x.csv",
      importedAt: "2024-07-01T10:00:00.000Z",
    });
    const c = b.bookingPages[0]!.content;
    expect(c).toContain("Datum: 2024-06-15");
    expect(c).toContain("Betrag: 1234.56");
    expect(c).toContain("Mandant-Nr: 10001");
  });

  test("Umlaute/Sonderzeichen im Dateinamen werden slugifiziert", () => {
    const b = buildDatevImportBundle(result([{}]), {
      filename: "Buchungen_März 2024!.csv",
      importedAt: "2024-07-01T10:00:00.000Z",
    });
    expect(b.importPage.slug).toContain("buchungen-marz-2024-csv");
  });

  test("Fehler und Warnungen landen im Import-Content", () => {
    const r = result([]);
    r.errors = [{ row: 2, error: "kaputt" }];
    r.error_count = 1;
    const b = buildDatevImportBundle(r, { filename: "x.csv" });
    expect(b.importPage.content).toContain("## Fehler");
    expect(b.importPage.content).toContain("kaputt");
    expect(b.warnings.length).toBeGreaterThan(0);
  });
});
