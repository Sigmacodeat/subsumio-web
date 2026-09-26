/**
 * Austrian statute recognition in the citation guardrail: abbreviations with
 * umlauts/ß (AußStrG), the dot-less "Abs" citation style (§ 7 Abs 4 VwGVG),
 * and the procedural statutes added to KNOWN_LAWS (ASGG, VwGVG, JN, …).
 */
import { describe, expect, test } from "bun:test";
import {
  KNOWN_LAWS,
  checkCitationGrounding,
  extractCitations,
  extractLawAbbreviations,
} from "../src/core/citation-guardrail.ts";

describe("KNOWN_LAWS covers Austrian procedural and special statutes", () => {
  test.each([
    "AußStrG",
    "ASGG",
    "VwGVG",
    "VfGG",
    "VwGG",
    "BVwGG",
    "ArbVG",
    "MRG",
    "WEG",
    "KSchG",
    "UGB",
    "GmbHG",
    "AktG",
    "IO",
    "EO",
    "GOG",
    "RAO",
    "RATG",
    "GGG",
    "AVG",
    "VStG",
    "BAO",
    "FinStrG",
    "ASVG",
    "AlVG",
    "EheG",
    "UVG",
    "ABGB",
    "StGB",
    "StPO",
    "ZPO",
    "JN",
    "UWG",
    "MSchG",
    "PatG",
    "UrhG",
    "DSG",
    "ECG",
    "TKG",
    "GewO",
    "WGG",
    "BTVG",
    "MedienG",
  ])("%s is a known law", (law) => {
    expect(KNOWN_LAWS.has(law)).toBe(true);
  });
});

describe("extractCitations / extractLawAbbreviations with Austrian citations", () => {
  test("§ 16 AußStrG — ß inside the abbreviation is part of the law", () => {
    expect(extractCitations("Nach § 16 AußStrG ist das Rekursverfahren zweiseitig.")).toEqual([
      "§ 16 AußStrG",
    ]);
    expect(
      extractLawAbbreviations("Nach § 16 AußStrG ist das Rekursverfahren zweiseitig.")
    ).toEqual(["AußStrG"]);
  });

  test("§ 7 Abs 4 VwGVG — Abs without dot is the Absatz, not a law", () => {
    expect(extractCitations("Die Frist beträgt nach § 7 Abs 4 VwGVG vier Wochen.")).toEqual([
      "§ 7 Abs. 4 VwGVG",
    ]);
    expect(extractLawAbbreviations("Die Frist beträgt nach § 7 Abs 4 VwGVG vier Wochen.")).toEqual([
      "VwGVG",
    ]);
  });

  test("§ 50 ASGG", () => {
    expect(extractCitations("Zuständig ist das Arbeits- und Sozialgericht (§ 50 ASGG).")).toEqual([
      "§ 50 ASGG",
    ]);
    expect(extractLawAbbreviations("Zuständig ist das ASG (§ 50 ASGG).")).toEqual(["ASGG"]);
  });
});

describe("checkCitationGrounding accepts grounded Austrian citations", () => {
  const context = `
§ 16 AußStrG Rekursverfahren
(1) Das Rekursverfahren ist zweiseitig.

§ 7 VwGVG Beschwerdefrist
(4) Die Frist zur Erhebung einer Beschwerde beträgt vier Wochen.

§ 50 ASGG Arbeitsrechtssachen
(1) Arbeitsrechtssachen sind ...
`;

  test("known Austrian laws are not flagged as non-existent", () => {
    const answer =
      "Das Rekursverfahren ist zweiseitig (§ 16 AußStrG). Die Beschwerdefrist beträgt vier Wochen (§ 7 Abs 4 VwGVG). Zuständig ist das ASG (§ 50 ASGG).";
    const result = checkCitationGrounding({
      answer,
      context,
      topSlugs: ["law/at/außstrg", "law/at/vwgvg", "law/at/asgg"],
    });
    expect(result.non_existent_laws).toEqual([]);
    expect(result.ungrounded_citations).toEqual([]);
    expect(result.all_citations).toContain("§ 16 AußStrG");
    expect(result.all_citations).toContain("§ 7 Abs. 4 VwGVG");
    expect(result.all_citations).toContain("§ 50 ASGG");
  });

  test("a made-up abbreviation is still flagged", () => {
    const result = checkCitationGrounding({
      answer: "Nach § 16 AußStrX gilt das.",
      context,
      topSlugs: ["law/at/außstrg"],
    });
    expect(result.non_existent_laws).toContain("AußStrX");
  });
});
