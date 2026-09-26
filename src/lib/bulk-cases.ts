/**
 * Massenverfahren (Bulk Case Management)
 * =======================================
 * Bulk import cases via CSV with shared mandate_id,
 * batch drafting, batch filing, portfolio board.
 */

export interface BulkCaseRow {
  case_number: string;
  client_name: string;
  client_email?: string;
  opponent_name?: string;
  matter: string;
  legal_area?: string;
  court?: string;
  dispute_value?: number;
  mandate_id: string;
}

/** Most rows one import request handles (each row costs several engine calls). */
export const BULK_IMPORT_MAX_ROWS = 500;

/**
 * Outcome of one CSV row: created, skipped because the matter already exists
 * (in the firm or earlier in the same CSV), stopped by the conflict check, or
 * failed (invalid row, check unavailable, engine refused the write).
 */
export type BulkRowStatus = "created" | "exists" | "conflict" | "error";

export interface BulkRowResult {
  line: number;
  case_number: string;
  client_name?: string;
  status: BulkRowStatus;
  slug?: string;
  error?: string;
  conflicts?: string[];
}

export interface BulkImportResult {
  total: number;
  created: number;
  exists: number;
  conflicts: number;
  errors: number;
  results: BulkRowResult[];
}

/**
 * Parse a single CSV line respecting RFC 4180 quoting rules.
 * Handles quoted fields containing commas, quotes (escaped as ""),
 * and newlines (though we split by line first for simplicity).
 */
function parseCsvLine(line: string, delimiter: CsvDelimiter = ","): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i]!;

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

type CsvDelimiter = "," | ";";

/**
 * Austrian/German Excel writes CSV with `;` (the comma is the decimal
 * separator). The header line decides: whichever separator splits it into
 * more columns (outside quotes) wins.
 */
export function detectCsvDelimiter(headerLine: string): CsvDelimiter {
  return parseCsvLine(headerLine, ";").length > parseCsvLine(headerLine, ",").length ? ";" : ",";
}

/**
 * Streitwert as typed in Austria/Germany or in plain notation:
 * "10.000,50" → 10000.5, "10.000" → 10000, "1.234.567" → 1234567,
 * "10000.50" → 10000.5, "10,5" → 10.5, "€ 10.000,-" → 10000.
 * Returns NaN when the value is not a readable amount.
 */
export function parseDisputeValue(raw: string): number {
  let s = raw
    .replace(/\s|\u00a0/g, "")
    .replace(/^(eur|€)/i, "")
    .replace(/(eur|€)$/i, "")
    .replace(/,-+$/, "");
  if (!s) return NaN;
  if (!/^-?[\d.,']+$/.test(s)) return NaN;
  s = s.replace(/'/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the later one is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Only commas: "10,5" is a decimal (AT), "1,234,567" is grouping.
    if (/^-?\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, "");
    else if (s.indexOf(",") === lastComma) s = s.replace(",", ".");
    else return NaN;
  } else if (lastDot >= 0) {
    // Only dots: "10.000" / "1.234.567" are thousands (AT), "10000.50" decimal.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else if ((s.match(/\./g) ?? []).length > 1) return NaN;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export interface ParsedCsvCases {
  /** Valid rows with their line number in the CSV (header = line 1). */
  rows: Array<{ line: number; row: BulkCaseRow }>;
  /** Rows that cannot be imported, with the reason. */
  invalid: Array<{ line: number; case_number?: string; error: string }>;
  delimiter: CsvDelimiter;
}

export function parseCsvCaseRows(csvText: string): ParsedCsvCases {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const delimiter = detectCsvDelimiter(lines[0] ?? "");
  const result: ParsedCsvCases = { rows: [], invalid: [], delimiter };
  if (lines.length < 2) return result;

  const headers = parseCsvLine(lines[0]!, delimiter).map((h) => h.toLowerCase());

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const values = parseCsvLine(lines[i]!, delimiter);
    const row: Partial<BulkCaseRow> = {};
    let disputeRaw = "";
    headers.forEach((header, idx) => {
      const value = values[idx] ?? "";
      switch (header) {
        case "case_number":
        case "aktenzeichen":
          row.case_number = value;
          break;
        case "client_name":
        case "mandant":
          row.client_name = value;
          break;
        case "client_email":
        case "email":
          row.client_email = value;
          break;
        case "opponent_name":
        case "gegner":
          row.opponent_name = value;
          break;
        case "matter":
        case "gegenstand":
          row.matter = value;
          break;
        case "legal_area":
        case "rechtsgebiet":
          row.legal_area = value;
          break;
        case "court":
        case "gericht":
          row.court = value;
          break;
        case "dispute_value":
        case "streitwert":
          disputeRaw = value;
          row.dispute_value = value ? parseDisputeValue(value) : undefined;
          break;
        case "mandate_id":
        case "klammer":
          row.mandate_id = value;
          break;
      }
    });

    const line = i + 1;
    if (!(row.case_number && row.client_name && row.matter && row.mandate_id)) {
      result.invalid.push({
        line,
        case_number: row.case_number || undefined,
        error: "Pflichtangabe fehlt (Aktenzeichen, Mandant, Gegenstand oder Klammer)",
      });
      continue;
    }
    if (row.dispute_value !== undefined && Number.isNaN(row.dispute_value)) {
      result.invalid.push({
        line,
        case_number: row.case_number,
        error: `Streitwert „${disputeRaw}“ ist kein lesbarer Betrag`,
      });
      continue;
    }
    result.rows.push({ line, row: row as BulkCaseRow });
  }

  return result;
}

/** Valid rows only — for previews; the import reports invalid rows too. */
export function parseCsvCases(csvText: string): BulkCaseRow[] {
  return parseCsvCaseRows(csvText).rows.map((r) => r.row);
}

export function caseFrontmatterFromRow(row: BulkCaseRow) {
  return {
    type: "legal_case",
    status: "open",
    case_number: row.case_number,
    client_name: row.client_name,
    client_email: row.client_email,
    opponent_name: row.opponent_name,
    matter: row.matter,
    legal_area: row.legal_area,
    court: row.court,
    dispute_value: row.dispute_value,
    mandate_id: row.mandate_id,
    created_via: "bulk_import",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export interface PortfolioItem {
  case_slug: string;
  case_number: string;
  client_name: string;
  matter: string;
  status: string;
  mandate_id: string;
  next_deadline?: string;
  last_activity?: string;
}

export function groupByMandateId(items: PortfolioItem[]): Map<string, PortfolioItem[]> {
  const groups = new Map<string, PortfolioItem[]>();
  for (const item of items) {
    const existing = groups.get(item.mandate_id) ?? [];
    existing.push(item);
    groups.set(item.mandate_id, existing);
  }
  return groups;
}

/**
 * What the Massenanlage page says when the import request did not return a
 * result. Only the answers the route gives BEFORE writing anything
 * (validation, case list unavailable) mean "nothing was created"; a timeout or
 * server error may hit after some rows were already written, because the
 * route writes row by row. Re-running is safe: existing case numbers are
 * skipped, never overwritten.
 */
export function bulkImportFailureMessage(
  status: number,
  code: string | undefined,
  en: boolean
): string {
  const beforeWrite =
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 413 ||
    status === 429 ||
    code === "guard_unavailable" ||
    code === "too_many_rows";
  if (beforeWrite) {
    return en
      ? "Import failed — no cases were created. Please check the CSV and try again."
      : "Import fehlgeschlagen — es wurden keine Akten angelegt. Bitte prüfen Sie die CSV-Daten und versuchen Sie es erneut.";
  }
  return en
    ? "The import was interrupted — some cases may already have been created. Check the case list; running the import again is safe, existing case numbers are skipped."
    : "Der Import wurde unterbrochen — ein Teil der Akten kann bereits angelegt sein. Bitte die Aktenliste prüfen; ein erneuter Import ist sicher, bestehende Aktenzeichen werden übersprungen.";
}
