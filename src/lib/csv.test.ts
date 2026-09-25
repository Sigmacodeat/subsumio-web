import { describe, expect, test } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  test("quotes every cell so separators and line breaks stay inside it", () => {
    expect(csvCell("Mietvertrag; Anlage 2")).toBe('"Mietvertrag; Anlage 2"');
    expect(csvCell('Er sagte "nein"\nund ging')).toBe('"Er sagte ""nein""\nund ging"');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(1500)).toBe('"1500"');
  });

  test("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("-5")).toBe(`"'-5"`);
  });

  test("builds a document with one line per row", () => {
    const csv = toCsv([
      ["Dokument", "Frage"],
      ["a;b", "x"],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(['"Dokument";"Frage"', '"a;b";"x"']);
  });
});
