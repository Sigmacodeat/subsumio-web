import { describe, expect, it } from "vitest";
import { parseMarkdownTables, tablesToXlsxBuffer } from "./xlsx-export";

describe("parseMarkdownTables", () => {
  it("parst eine einfache Tabelle", () => {
    const md = [
      "# Review",
      "",
      "| Dokument | Klausel | Risiko |",
      "|----------|---------|--------|",
      "| A.pdf    | Kündigung | hoch |",
      "| B.pdf    | Haftung   | mittel |",
      "",
      "Fließtext danach.",
    ].join("\n");
    const tables = parseMarkdownTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toEqual([
      ["Dokument", "Klausel", "Risiko"],
      ["A.pdf", "Kündigung", "hoch"],
      ["B.pdf", "Haftung", "mittel"],
    ]);
  });

  it("trennt mehrere Tabellen", () => {
    const md = "| a |\n|---|\n| 1 |\n\ntext\n\n| b |\n|---|\n| 2 |";
    expect(parseMarkdownTables(md)).toHaveLength(2);
  });

  it("ignoriert Tabellen ohne Datenzeilen und entfernt Markdown-Formatierung", () => {
    expect(parseMarkdownTables("| a |\n|---|")).toHaveLength(0);
    const [t] = parseMarkdownTables("| a |\n|---|\n| **fett** und *kursiv* |");
    expect(t?.[1]?.[0]).toBe("fett und kursiv");
  });

  it("keine Tabelle im Fließtext", () => {
    expect(parseMarkdownTables("Hier steht |kein| Tabellenbeginn.")).toHaveLength(0);
  });
});

describe("tablesToXlsxBuffer", () => {
  it("erzeugt ein gültiges XLSX (ZIP-Magic)", async () => {
    const buf = await tablesToXlsxBuffer(
      [
        [
          ["H1", "H2"],
          ["a", "b"],
        ][0]
          ? [
              ["H1", "H2"],
              ["a", "b"],
            ]
          : [],
      ],
      "Test"
    );
    // XLSX = ZIP-Container
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(1_000);
  });
});
