/**
 * Tests for DATEV Buchungsstapel Import-Parser
 */

import { test, expect, describe } from "vitest";
import {
  buildDatevImportBundle,
  parseDatevCsv,
  validateDatevImport,
  type DatevImportResult,
} from "@/lib/datev-import";

const VALID_CSV = `USt-ID;Datum;Belegnr;Buchungstext;Konto;Gegenkonto;Betrag;Steuerkennzeichen;Kostenstelle;Mandant;Stunden;Typ;Berater;Mandant-Nr
DE123456789;01.06.2026;R-2026-0001;Beratung Vertragsrecht;8400;1776;500,00;19;1300;Acme GmbH;2,50;Honorar;12345;67890
DE123456789;15.06.2026;R-2026-0002;Gerichtskosten;4900;1776;75,50;19;1200;Müller GmbH;0,00;Auslage;12345;67890
DE123456789;30.06.2026;R-2026-0003;Recherche;8400;1776;200,00;19;1100;Test GmbH;1,00;Honorar;12345;67890`;

describe("parseDatevCsv — basic parsing", () => {
  test("parses valid CSV with 3 entries", () => {
    const result = parseDatevCsv(VALID_CSV);
    expect(result.entries.length).toBe(3);
    expect(result.error_count).toBe(0);
  });

  test("parses dates correctly (DD.MM.YYYY → ISO)", () => {
    const result = parseDatevCsv(VALID_CSV);
    expect(result.entries[0].date).toBe("2026-06-01");
    expect(result.entries[1].date).toBe("2026-06-15");
    expect(result.entries[2].date).toBe("2026-06-30");
  });

  test("parses German number format (comma as decimal)", () => {
    const result = parseDatevCsv(VALID_CSV);
    expect(result.entries[0].betrag).toBe(500.0);
    expect(result.entries[1].betrag).toBe(75.5);
    expect(result.entries[0].stunden).toBe(2.5);
  });

  test("extracts all fields correctly", () => {
    const result = parseDatevCsv(VALID_CSV);
    const first = result.entries[0];
    expect(first.belegnr).toBe("R-2026-0001");
    expect(first.buchungstext).toBe("Beratung Vertragsrecht");
    expect(first.konto).toBe("8400");
    expect(first.gegenkonto).toBe("1776");
    expect(first.steuerkennzeichen).toBe("19");
    expect(first.kostenstelle).toBe("1300");
    expect(first.mandant).toBe("Acme GmbH");
    expect(first.typ).toBe("Honorar");
    expect(first.berater).toBe("12345");
    expect(first.mandantNr).toBe("67890");
  });

  test("detects period from/to", () => {
    const result = parseDatevCsv(VALID_CSV);
    expect(result.period_from).toBe("2026-06-01");
    expect(result.period_to).toBe("2026-06-30");
  });
});

describe("parseDatevCsv — header validation", () => {
  test("rejects invalid header", () => {
    const badCsv = "Wrong;Header;Format\n1;2;3";
    const result = parseDatevCsv(badCsv);
    expect(result.entries.length).toBe(0);
    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toContain("Header mismatch");
  });

  test("empty input → empty result", () => {
    const result = parseDatevCsv("");
    expect(result.entries.length).toBe(0);
    expect(result.total_count).toBe(0);
  });
});

describe("parseDatevCsv — CSV escaping", () => {
  test("handles quoted fields with semicolons", () => {
    const csv = `${EXPECTED_HEADER_JOIN()}
DE123;01.06.2026;R-001;"Beratung; Vertragsrecht";8400;1776;500,00;19;1300;Acme;2,00;Honorar;12345;67890`;
    const result = parseDatevCsv(csv);
    expect(result.entries[0].buchungstext).toBe("Beratung; Vertragsrecht");
  });

  test("handles quoted fields with escaped quotes", () => {
    const csv = `${EXPECTED_HEADER_JOIN()}
DE123;01.06.2026;R-001;"Beratung ""wichtig""";8400;1776;500,00;19;1300;Acme;2,00;Honorar;12345;67890`;
    const result = parseDatevCsv(csv);
    expect(result.entries[0].buchungstext).toBe('Beratung "wichtig"');
  });

  test("handles Unicode in fields", () => {
    const csv = `${EXPECTED_HEADER_JOIN()}
DE123;01.06.2026;R-001;Beratung Müller & Söhne — Köln €;8400;1776;500,00;19;1300;Müller GmbH;2,00;Honorar;12345;67890`;
    const result = parseDatevCsv(csv);
    expect(result.entries[0].buchungstext).toContain("Müller & Söhne");
    expect(result.entries[0].buchungstext).toContain("€");
  });
});

describe("parseDatevCsv — error handling", () => {
  test("too few columns → error", () => {
    const csv = `${EXPECTED_HEADER_JOIN()}
DE123;01.06.2026;R-001;Too few columns`;
    const result = parseDatevCsv(csv);
    expect(result.entries.length).toBe(0);
    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toContain("14 columns");
  });

  test("invalid date → error", () => {
    const csv = `${EXPECTED_HEADER_JOIN()}
DE123;not-a-date;R-001;Test;8400;1776;500,00;19;1300;Acme;2,00;Honorar;12345;67890`;
    const result = parseDatevCsv(csv);
    expect(result.entries.length).toBe(0);
    expect(result.error_count).toBe(1);
    expect(result.errors[0].error).toContain("Invalid date");
  });

  test("empty lines are skipped", () => {
    const csv = `${VALID_CSV}\n\n\n`;
    const result = parseDatevCsv(csv);
    expect(result.entries.length).toBe(3);
  });

  test("two-digit year → 20XX", () => {
    const csv = `${EXPECTED_HEADER_JOIN()}
DE123;01.06.26;R-001;Test;8400;1776;500,00;19;1300;Acme;2,00;Honorar;12345;67890`;
    const result = parseDatevCsv(csv);
    expect(result.entries[0].date).toBe("2026-06-01");
  });
});

describe("validateDatevImport", () => {
  test("valid result → no warnings", () => {
    const result = parseDatevCsv(VALID_CSV);
    const validation = validateDatevImport(result);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.length).toBe(0);
  });

  test("empty result → warning", () => {
    const result: DatevImportResult = {
      entries: [],
      errors: [],
      total_count: 0,
      valid_count: 0,
      error_count: 0,
    };
    const validation = validateDatevImport(result);
    expect(validation.warnings).toContain("No valid entries found");
  });

  test("negative amounts → warning", () => {
    const csv = `${EXPECTED_HEADER_JOIN()}
DE123;01.06.2026;R-001;Storno;8400;1776;-100,00;19;1300;Acme;0,00;Honorar;12345;67890`;
    const result = parseDatevCsv(csv);
    const validation = validateDatevImport(result);
    expect(validation.warnings.some((w: string) => w.includes("negative"))).toBe(true);
  });
});

describe("buildDatevImportBundle", () => {
  test("builds import page and one booking page per valid entry", () => {
    const result = parseDatevCsv(VALID_CSV);
    const bundle = buildDatevImportBundle(result, {
      filename: "DATEV Juni 2026.csv",
      source: "upload",
      importedAt: "2026-06-22T10:30:00.000Z",
      importedBy: "anwalt@example.test",
    });

    expect(bundle.importPage.slug).toBe("legal/datev-imports/20260622103000-datev-juni-2026-csv");
    expect(bundle.importPage.type).toBe("datev_import");
    expect(bundle.importPage.frontmatter.valid_count).toBe(3);
    expect(bundle.importPage.frontmatter.total_amount).toBe(775.5);
    expect(bundle.importPage.frontmatter.booking_slugs).toHaveLength(3);
    expect(bundle.bookingPages).toHaveLength(3);
    expect(bundle.bookingPages[0].slug).toContain("/booking-0001-r-2026-0001");
    expect(bundle.bookingPages[0].frontmatter.import_slug).toBe(bundle.importPage.slug);
    expect(bundle.bookingPages[0].frontmatter.betrag).toBe(500);
  });

  test("keeps parser errors and warnings on import page frontmatter", () => {
    const csv = `${EXPECTED_HEADER_JOIN()}
DE123;01.06.2026;R-001;Valid;8400;1776;500,00;19;1300;Acme;2,00;Honorar;12345;67890
DE123;bad-date;R-002;Invalid;8400;1776;100,00;19;1300;Acme;0,00;Honorar;12345;67890`;
    const result = parseDatevCsv(csv);
    const bundle = buildDatevImportBundle(result, {
      filename: "mixed.csv",
      importedAt: "2026-06-22T10:30:00.000Z",
    });

    expect(bundle.bookingPages).toHaveLength(1);
    expect(bundle.warnings.some((warning) => warning.includes("parsing errors"))).toBe(true);
    expect(bundle.importPage.frontmatter.error_count).toBe(1);
    expect(bundle.importPage.frontmatter.errors).toEqual(result.errors);
  });
});

function EXPECTED_HEADER_JOIN(): string {
  return "USt-ID;Datum;Belegnr;Buchungstext;Konto;Gegenkonto;Betrag;Steuerkennzeichen;Kostenstelle;Mandant;Stunden;Typ;Berater;Mandant-Nr";
}
