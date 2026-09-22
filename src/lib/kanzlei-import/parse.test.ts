import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { decodeText, parseDelimited, readImportFile } from "./parse";

const file = (name: string, bytes: Uint8Array | ArrayBuffer) => ({
  name,
  arrayBuffer: async () =>
    bytes instanceof Uint8Array
      ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      : bytes,
});

describe("CSV", () => {
  it("detects semicolon, comma and tab, keeps quoted separators and line breaks", () => {
    expect(parseDelimited('Akte;Mandant\n"1/26";"Berger; Anna"\n')).toEqual([
      ["Akte", "Mandant"],
      ["1/26", "Berger; Anna"],
    ]);
    expect(parseDelimited("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseDelimited("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseDelimited('Notiz;X\n"Zeile 1\nZeile 2";y')[1]).toEqual(["Zeile 1\nZeile 2", "y"]);
  });

  it("reads Windows-1252 exports without losing umlauts", async () => {
    // "Mandant;Gegner\nMüller;Größ" in Windows-1252
    const bytes = new Uint8Array([
      ...Buffer.from("Mandant;Gegner\nM"),
      0xfc,
      ...Buffer.from("ller;Gr"),
      0xf6,
      0xdf,
    ]);
    expect(decodeText(bytes).encoding).toBe("windows-1252");
    const table = await readImportFile(file("export.csv", bytes));
    expect(table.rows[0]).toEqual(["Müller", "Größ"]);
  });

  it("pads short rows and refuses files without data rows", async () => {
    const t = await readImportFile(file("a.csv", new TextEncoder().encode("a;b;c\n1")));
    expect(t.rows[0]).toEqual(["1", "", ""]);
    await expect(readImportFile(file("a.csv", new TextEncoder().encode("a;b\n")))).rejects.toThrow(
      /keine Datenzeilen/
    );
    await expect(readImportFile(file("alt.xls", new Uint8Array([1])))).rejects.toThrow(/\.xlsx/);
  });
});

describe("Excel", () => {
  it("reads the first sheet with dates, numbers, formulas and durations as text", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Zeiten");
    ws.addRow(["Akte", "Datum", "Dauer", "Satz", "Summe", "Tätigkeit"]);
    ws.addRow([
      "2026/014",
      new Date(Date.UTC(2026, 8, 17)),
      new Date(Date.UTC(1899, 11, 30, 1, 30)),
      280.5,
      { formula: "D2*1.5", result: 420.75 },
      { richText: [{ text: "Schriftsatz " }, { text: "verfasst" }] },
    ]);
    ws.addRow([]);
    const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const table = await readImportFile(file("zeiten.xlsx", bytes));
    expect(table.encoding).toBe("xlsx");
    expect(table.headers).toEqual(["Akte", "Datum", "Dauer", "Satz", "Summe", "Tätigkeit"]);
    expect(table.rows).toEqual([
      ["2026/014", "17.09.2026", "1:30", "280,5", "420,75", "Schriftsatz verfasst"],
    ]);
  });
});
