// Reading import files: CSV/TXT (UTF-8 or Windows-1252, ; or , or tab) and Excel (.xlsx).

export interface ImportTable {
  headers: string[];
  rows: string[][];
  /** Detected text encoding for CSV, "xlsx" for Excel. */
  encoding: "utf-8" | "windows-1252" | "xlsx";
}

/**
 * Exports of older practice software are often Windows-1252 ("ANSI"). Invalid
 * UTF-8 means the file is not UTF-8; decoding it as UTF-8 anyway turns every
 * umlaut into a replacement character.
 */
export function decodeText(bytes: ArrayBuffer | Uint8Array): {
  text: string;
  encoding: "utf-8" | "windows-1252";
} {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(view), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(view), encoding: "windows-1252" };
  }
}

function detectDelimiter(firstLine: string): string {
  const counts: Array<[string, number]> = [";", ",", "\t"].map((d) => [
    d,
    firstLine.split(d).length - 1,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

/** Delimited text with "…" quoting (doubled quotes inside), CRLF or LF. Empty rows dropped. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const delim = detectDelimiter(clean.split(/\r?\n/)[0] ?? "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** One cell as the text a person sees; dates as dd.mm.yyyy (time kept when set). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const d = `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`;
    const hasTime = value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0;
    // Excel stores a bare duration such as 1:30 as a date on 30.12.1899.
    if (value.getUTCFullYear() === 1899)
      return `${value.getUTCHours()}:${pad(value.getUTCMinutes())}`;
    return hasTime ? `${d} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` : d;
  }
  if (typeof value === "object") {
    const v = value as {
      richText?: Array<{ text: string }>;
      text?: unknown;
      result?: unknown;
      hyperlink?: string;
      error?: string;
    };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return cellText(v.result);
    if (v.text !== undefined) return cellText(v.text);
    if (v.error) return "";
    return "";
  }
  if (typeof value === "number") return String(value).replace(".", ",");
  return String(value);
}

/** First worksheet of an .xlsx file. */
export async function parseXlsx(bytes: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  const width = sheet.columnCount;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let c = 1; c <= width; c++) values.push(cellText(row.getCell(c).value).trim());
    if (values.some((v) => v !== "")) rows.push(values);
  });
  return rows;
}

export async function readImportFile(file: {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<ImportTable> {
  const bytes = await file.arrayBuffer();
  let table: string[][];
  let encoding: ImportTable["encoding"];
  if (/\.xlsx$/i.test(file.name)) {
    table = await parseXlsx(bytes);
    encoding = "xlsx";
  } else if (/\.xls$/i.test(file.name)) {
    throw new Error(
      "Das alte Excel-Format (.xls) wird nicht gelesen. Bitte in Excel als .xlsx oder CSV speichern."
    );
  } else {
    const decoded = decodeText(bytes);
    table = parseDelimited(decoded.text);
    encoding = decoded.encoding;
  }
  if (table.length < 2) {
    throw new Error("Die Datei enthält keine Datenzeilen unter der Überschriftenzeile.");
  }
  const headers = table[0].map((h) => h.trim());
  const rows = table.slice(1).map((r) => {
    const padded = [...r];
    while (padded.length < headers.length) padded.push("");
    return padded;
  });
  return { headers, rows, encoding };
}
