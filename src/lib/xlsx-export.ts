/**
 * WP-7.44 — Office-Deliverables: Markdown-Tabellen → echte .xlsx-Datei
 * (exceljs). Agent-Outputs (Tabular Review, Vergleichstabellen) werden so
 * als bearbeitbare Office-Datei abgelegt statt nur als Text.
 */

import ExcelJS from "exceljs";

/** Eine Markdown-Tabelle als Zeilen von Zelltexten (erste Zeile = Header). */
export type MdTable = string[][];

/** Erkennt eine Markdown-Tabellenzeile (`| a | b |`). */
function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 2;
}

/** Trennzeile (`|---|---|`) — wird übersprungen, keine Datenzeile. */
function isSeparatorRow(line: string): boolean {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.length > 0 && t.split("|").every((c) => /^:?-{2,}:?$/.test(c.trim()));
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) =>
      c
        .trim()
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
    );
}

/**
 * Alle Markdown-Tabellen aus einem Text. Tabellen werden durch Nicht-
 * Tabellenzeilen getrennt; jede Tabelle ist ein eigenes Array.
 */
export function parseMarkdownTables(md: string): MdTable[] {
  const tables: MdTable[] = [];
  let current: MdTable = [];
  for (const line of md.split("\n")) {
    if (isTableRow(line)) {
      if (isSeparatorRow(line)) continue;
      current.push(cells(line));
    } else if (current.length > 0) {
      tables.push(current);
      current = [];
    }
  }
  if (current.length > 0) tables.push(current);
  // Mindestens Header + eine Datenzeile, sonst ist es keine Tabelle.
  return tables.filter((t) => t.length >= 2 && t[0]!.length > 0);
}

/**
 * Markdown-Tabellen → XLSX-Buffer. Jede Tabelle wird ein eigenes Worksheet
 * ("Tabelle 1", "Tabelle 2", …), erste Zeile fett, Spaltenbreite aus dem
 * längsten Zellwert (gekappt).
 */
export async function tablesToXlsxBuffer(tables: MdTable[], title: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Subsumio";
  workbook.created = new Date();
  tables.forEach((table, i) => {
    const sheet = workbook.addWorksheet(`Tabelle ${i + 1}`);
    table.forEach((row, r) => {
      const excelRow = sheet.addRow(row);
      if (r === 0) {
        excelRow.font = { bold: true };
        excelRow.commit();
      }
    });
    sheet.columns.forEach((col, ci) => {
      const max = Math.max(...table.map((r) => (r[ci] ?? "").length), 8);
      col.width = Math.min(max + 2, 60);
    });
  });
  // Metadaten-Sheet mit Titel + Hinweis auf Prüfpflicht.
  const meta = workbook.addWorksheet("Info");
  meta.addRow([title]);
  meta.addRow(["Erstellt mit Subsumio — KI-generierte Inhalte anwaltlich prüfen."]);
  meta.addRow([new Date().toISOString()]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
