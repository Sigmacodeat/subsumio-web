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

export interface DatevImportBundleOptions {
  filename: string;
  source?: "upload" | "watch_dir" | "manual";
  importedAt?: string;
  importedBy?: string;
}

export interface DatevImportPage {
  slug: string;
  title: string;
  type: "datev_import";
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface DatevBookingPage {
  slug: string;
  title: string;
  type: "datev_booking";
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface DatevImportPageBundle {
  importPage: DatevImportPage;
  bookingPages: DatevBookingPage[];
  warnings: string[];
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

function slugifyPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatDatevEntryContent(entry: DatevImportEntry): string {
  return [
    `# DATEV Buchung ${entry.belegnr || entry.date}`,
    "",
    `- Datum: ${entry.date}`,
    `- Belegnummer: ${entry.belegnr || "-"}`,
    `- Buchungstext: ${entry.buchungstext || "-"}`,
    `- Betrag: ${entry.betrag.toFixed(2)}`,
    `- Konto/Gegenkonto: ${entry.konto || "-"} / ${entry.gegenkonto || "-"}`,
    `- Steuerkennzeichen: ${entry.steuerkennzeichen || "-"}`,
    `- Kostenstelle: ${entry.kostenstelle || "-"}`,
    `- Mandant: ${entry.mandant || "-"}`,
    `- Mandant-Nr: ${entry.mandantNr || "-"}`,
    `- Typ: ${entry.typ || "-"}`,
    `- Berater: ${entry.berater || "-"}`,
  ].join("\n");
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

export function buildDatevImportBundle(
  result: DatevImportResult,
  options: DatevImportBundleOptions
): DatevImportPageBundle {
  const importedAt = options.importedAt || new Date().toISOString();
  const source = options.source || "upload";
  const filenamePart = slugifyPart(options.filename || "datev-import") || "datev-import";
  const timestampPart = importedAt.replace(/[^0-9]/g, "").slice(0, 14);
  const importSlug = `legal/datev-imports/${timestampPart}-${filenamePart}`;
  const validation = validateDatevImport(result);

  const totalAmount = result.entries.reduce((sum, entry) => sum + entry.betrag, 0);
  const totalHours = result.entries.reduce((sum, entry) => sum + entry.stunden, 0);
  const bookingPages: DatevBookingPage[] = result.entries.map((entry, index) => {
    const bookingPart =
      slugifyPart(entry.belegnr || `${entry.date}-${index + 1}`) || `buchung-${index + 1}`;
    const slug = `${importSlug}/booking-${String(index + 1).padStart(4, "0")}-${bookingPart}`;
    return {
      slug,
      title: `DATEV Buchung ${entry.belegnr || index + 1}`,
      type: "datev_booking",
      content: formatDatevEntryContent(entry),
      frontmatter: {
        type: "datev_booking",
        import_slug: importSlug,
        source,
        imported_at: importedAt,
        booking_index: index + 1,
        ...entry,
      },
    };
  });

  const content = [
    `# DATEV Import ${options.filename}`,
    "",
    `Quelle: ${source}`,
    `Importiert am: ${importedAt}`,
    options.importedBy ? `Importiert von: ${options.importedBy}` : null,
    "",
    "## Zusammenfassung",
    "",
    `- Zeilen gesamt: ${result.total_count}`,
    `- Gueltige Buchungen: ${result.valid_count}`,
    `- Fehlerhafte Zeilen: ${result.error_count}`,
    `- Zeitraum: ${result.period_from || "-"} bis ${result.period_to || "-"}`,
    `- Kontenrahmen: ${result.kontenrahmen || "unbekannt"}`,
    `- Summe Betrag: ${totalAmount.toFixed(2)}`,
    `- Summe Stunden: ${totalHours.toFixed(2)}`,
    "",
    result.errors.length > 0 ? "## Fehler" : null,
    ...result.errors.map((error) => `- Zeile ${error.row}: ${error.error}`),
    validation.warnings.length > 0 ? "" : null,
    validation.warnings.length > 0 ? "## Warnungen" : null,
    ...validation.warnings.map((warning) => `- ${warning}`),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    importPage: {
      slug: importSlug,
      title: `DATEV Import ${options.filename}`,
      type: "datev_import",
      content,
      frontmatter: {
        type: "datev_import",
        filename: options.filename,
        source,
        imported_at: importedAt,
        imported_by: options.importedBy,
        total_count: result.total_count,
        valid_count: result.valid_count,
        error_count: result.error_count,
        period_from: result.period_from,
        period_to: result.period_to,
        kontenrahmen: result.kontenrahmen,
        total_amount: Number(totalAmount.toFixed(2)),
        total_hours: Number(totalHours.toFixed(2)),
        warnings: validation.warnings,
        errors: result.errors,
        booking_slugs: bookingPages.map((page) => page.slug),
      },
    },
    bookingPages,
    warnings: validation.warnings,
  };
}
