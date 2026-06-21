/**
 * DATEV Buchungsstapel Import-Parser
 * ===================================
 *
 * Parsed DATEV-Export-Dateien (Buchungsstapel CSV) und wandelt sie in
 * strukturierte Buchungseinträge um. Unterstütigt SKR03, SKR04 und SKR49.
 *
 * Format: DATEV-CSV mit Semikolon-Trennung, Header-Zeile, DD.MM.YYYY Datumsformat.
 *
 * P1-DATEV-001: DATEV Import Parser
 */

export interface DatevImportEntry {
  date: string;
  belegnr: string;
  buchungstext: string;
  konto: string;
  gegenkonto: string;
  betrag: number;
  steuerkennzeichen: string;
  kostenstelle: string;
  mandant: string;
  stunden: number;
  typ: string;
  berater: string;
  mandantNr: string;
}

export interface DatevImportResult {
  entries: DatevImportEntry[];
  errors: Array<{ row: number; error: string; raw?: string }>;
  total_count: number;
  valid_count: number;
  error_count: number;
  period_from?: string;
  period_to?: string;
  kontenrahmen?: string;
}

const EXPECTED_HEADER = [
  "USt-ID",
  "Datum",
  "Belegnr",
  "Buchungstext",
  "Konto",
  "Gegenkonto",
  "Betrag",
  "Steuerkennzeichen",
  "Kostenstelle",
  "Mandant",
  "Stunden",
  "Typ",
  "Berater",
  "Mandant-Nr",
];

function parseGermanDate(dateStr: string): string | null {
  const match = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseGermanNumber(value: string): number {
  if (!value || value.trim() === "") return 0;
  const cleaned = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ";") {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  cells.push(current);
  return cells;
}

export function parseDatevCsv(csvContent: string): DatevImportResult {
  const lines = csvContent.trim().split(/\r?\n/);
  const entries: DatevImportEntry[] = [];
  const errors: Array<{ row: number; error: string; raw?: string }> = [];

  if (lines.length === 0) {
    return { entries, errors, total_count: 0, valid_count: 0, error_count: 0 };
  }

  const headerCells = splitCsvLine(lines[0]);
  const headerMatch = EXPECTED_HEADER.every((h, i) => headerCells[i]?.trim() === h);

  if (!headerMatch) {
    errors.push({
      row: 0,
      error: `Header mismatch. Expected: ${EXPECTED_HEADER.join("; ")}. Got: ${headerCells.join("; ")}`,
      raw: lines[0],
    });
    return { entries, errors, total_count: lines.length - 1, valid_count: 0, error_count: 1 };
  }

  let periodFrom: string | undefined;
  let periodTo: string | undefined;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = splitCsvLine(line);

    if (cells.length < 14) {
      errors.push({
        row: i,
        error: `Expected 14 columns, got ${cells.length}`,
        raw: line,
      });
      continue;
    }

    const dateStr = cells[1].trim();
    const isoDate = parseGermanDate(dateStr);
    if (!isoDate) {
      errors.push({
        row: i,
        error: `Invalid date format: "${dateStr}" (expected DD.MM.YYYY)`,
        raw: line,
      });
      continue;
    }

    if (!periodFrom || isoDate < periodFrom) periodFrom = isoDate;
    if (!periodTo || isoDate > periodTo) periodTo = isoDate;

    const betrag = parseGermanNumber(cells[6]);
    const stunden = parseGermanNumber(cells[10]);

    entries.push({
      date: isoDate,
      belegnr: cells[2].trim(),
      buchungstext: cells[3].trim(),
      konto: cells[4].trim(),
      gegenkonto: cells[5].trim(),
      betrag,
      steuerkennzeichen: cells[7].trim(),
      kostenstelle: cells[8].trim(),
      mandant: cells[9].trim(),
      stunden,
      typ: cells[11].trim(),
      berater: cells[12].trim(),
      mandantNr: cells[13].trim(),
    });
  }

  const kontenrahmen = entries[0]
    ? entries[0].konto.startsWith("8") || entries[0].gegenkonto.startsWith("17")
      ? "SKR03"
      : entries[0].gegenkonto.startsWith("38")
        ? "SKR04"
        : entries[0].gegenkonto.startsWith("27")
          ? "SKR49"
          : undefined
    : undefined;

  return {
    entries,
    errors,
    total_count: lines.length - 1,
    valid_count: entries.length,
    error_count: errors.length,
    period_from: periodFrom,
    period_to: periodTo,
    kontenrahmen,
  };
}

export function validateDatevImport(result: DatevImportResult): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (result.error_count > 0) {
    warnings.push(`${result.error_count} row(s) had parsing errors`);
  }

  if (result.entries.length === 0) {
    warnings.push("No valid entries found");
  }

  const accounts = new Set<string>();
  result.entries.forEach((e) => {
    accounts.add(e.konto);
    accounts.add(e.gegenkonto);
  });

  const hasSk03 = [...accounts].some((a) => a.startsWith("8") || a.startsWith("17"));
  const hasSk04 = [...accounts].some((a) => a.startsWith("44") || a.startsWith("38"));
  const hasSk49 = [...accounts].some((a) => a.startsWith("27"));

  if (hasSk03 && hasSk04) {
    warnings.push(
      "Mixed account frameworks detected (SKR03 + SKR04) — verify correct Kontenrahmen"
    );
  }
  if (hasSk49 && (hasSk03 || hasSk04)) {
    warnings.push("Mixed AT/DE account frameworks detected — verify correct Kontenrahmen");
  }

  const negativeAmounts = result.entries.filter((e) => e.betrag < 0);
  if (negativeAmounts.length > 0) {
    warnings.push(
      `${negativeAmounts.length} entry(ies) with negative amounts — verify these are corrections/reversals`
    );
  }

  return { valid: warnings.length === 0, warnings };
}
