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

export interface BulkImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  case_slugs: string[];
  errors_detail: Array<{ row: number; error: string }>;
}

/**
 * Parse a single CSV line respecting RFC 4180 quoting rules.
 * Handles quoted fields containing commas, quotes (escaped as ""),
 * and newlines (though we split by line first for simplicity).
 */
function parseCsvLine(line: string): string[] {
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
      } else if (char === ",") {
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

export function parseCsvCases(csvText: string): BulkCaseRow[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const rows: BulkCaseRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    const row: Partial<BulkCaseRow> = {};
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
          row.dispute_value = value ? parseFloat(value) : undefined;
          break;
        case "mandate_id":
        case "klammer":
          row.mandate_id = value;
          break;
      }
    });

    if (row.case_number && row.client_name && row.matter && row.mandate_id) {
      rows.push(row as BulkCaseRow);
    }
  }

  return rows;
}

export function caseSlugFromRow(row: BulkCaseRow): string {
  const safePart = row.case_number
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `legal/cases/${safePart}`;
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
