/**
 * CSV for spreadsheet export (Excel, de-AT: semicolon-separated).
 *
 * Every cell is quoted, inner quotes doubled — a value with ";", a line break
 * or a quote no longer shifts the columns. Values that a spreadsheet would
 * run as a formula (=, +, -, @, tab, CR at the start) get a leading
 * apostrophe so a document title or AI answer is shown, never evaluated.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(cells: unknown[], separator = ";"): string {
  return cells.map(csvCell).join(separator);
}

/** Rows to a CSV document (CRLF line ends, BOM for Excel's UTF-8 detection). */
export function toCsv(rows: unknown[][], separator = ";"): string {
  return "﻿" + rows.map((r) => csvRow(r, separator)).join("\r\n");
}
