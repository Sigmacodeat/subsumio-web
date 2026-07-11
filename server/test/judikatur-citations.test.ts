import { describe, test, expect } from "bun:test";
import { extractNormReferences } from "../src/core/legal/judikatur-citations.ts";

describe("extractNormReferences", () => {
  test("extracts a simple single-§ Norm section", () => {
    const body = "Norm\nZPO §362 Abs2;\n\nRechtssatz\nSome legal principle...";
    expect(extractNormReferences(body)).toEqual([{ code: "ZPO", ref: "362" }]);
  });

  test("extracts multiple §§ from different codes", () => {
    const body = "Norm\nAKB §2 Abs2;\nVersVG §6 Abs2 D;\nZPO §268 IIID3;\n\nRechtssatz\n...";
    expect(extractNormReferences(body)).toEqual([
      { code: "AKB", ref: "2" },
      { code: "VersVG", ref: "6" },
      { code: "ZPO", ref: "268" },
    ]);
  });

  test("strips RIS classification suffixes (roman numerals, letters)", () => {
    const body = "Norm\nStGB §28 Bb;\nStGB §125;\n\nRechtssatz\n...";
    const refs = extractNormReferences(body);
    expect(refs).toEqual([
      { code: "StGB", ref: "28" },
      { code: "StGB", ref: "125" },
    ]);
  });

  test("handles a letter-suffixed paragraph ref", () => {
    const body = "Norm\nABGB §17a;\n\nRechtssatz\n...";
    expect(extractNormReferences(body)).toEqual([{ code: "ABGB", ref: "17a" }]);
  });

  test("dedupes repeated (code, ref) pairs", () => {
    const body = "Norm\nStGB §125;\nStGB §125 nochmal anders klassifiziert;\n\nRechtssatz\n...";
    expect(extractNormReferences(body)).toEqual([{ code: "StGB", ref: "125" }]);
  });

  test("returns [] when there is no Norm section", () => {
    const body = "# OGH — 6Ob657/85\n\nRIS Dokument\nGericht\nOGH\n\nRechtssatz\nEin Erbvertrag...";
    expect(extractNormReferences(body)).toEqual([]);
  });

  test("stops at the blank line before Rechtssatz even without an explicit header match", () => {
    const body = "Norm\nABGB §1249;\nABGB §1254;\n\nRechtssatz\nEin Erbvertrag kann...";
    expect(extractNormReferences(body)).toEqual([
      { code: "ABGB", ref: "1249" },
      { code: "ABGB", ref: "1254" },
    ]);
  });

  test("ignores a stray 'ff' continuation line without a code prefix", () => {
    const body = "Norm\nStPO §352 ff;\nZPO §268 IIB;\n\nRechtssatz\n...";
    expect(extractNormReferences(body)).toEqual([
      { code: "StPO", ref: "352" },
      { code: "ZPO", ref: "268" },
    ]);
  });
});
