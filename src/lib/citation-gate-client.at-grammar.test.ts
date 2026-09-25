// @vitest-environment node

import { describe, test, expect } from "vitest";
import { extractStatuteCitations, linkCitationsInHtml } from "@/lib/citation-gate-client";

// Austrian (and German) citation forms: every norm is found, a subdivision
// word is never taken for the statute.
describe("extractStatuteCitations — AT citation grammar", () => {
  const cases: [string, string[]][] = [
    ["§ 6 Abs 1 Z 5 KSchG", ["KSchG|§ 6 Abs 1 Z 5"]],
    ["§ 6 Abs. 1 Z. 5 KSchG", ["KSchG|§ 6 Abs. 1 Z. 5"]],
    ["§ 5 Abs 1 Z 2 KSchG", ["KSchG|§ 5 Abs 1 Z 2"]],
    ["§§ 1293 ff ABGB", ["ABGB|§ 1293"]],
    ["§ 1295 ff. ABGB", ["ABGB|§ 1295"]],
    ["§ 1295ff ABGB", ["ABGB|§ 1295"]],
    ["§ 1295 f ABGB", ["ABGB|§ 1295"]],
    ["§§ 1295, 1299 ABGB", ["ABGB|§ 1295", "ABGB|§ 1299"]],
    ["§§ 433, 434 BGB", ["BGB|§ 433", "BGB|§ 434"]],
    ["§§ 1293 bis 1295 ABGB", ["ABGB|§ 1293", "ABGB|§ 1295"]],
    ["§§ 1295 und 1299 ABGB", ["ABGB|§ 1295", "ABGB|§ 1299"]],
    ["Art 7 B-VG", ["B-VG|Art. 7"]],
    ["Art. 8 EMRK", ["EMRK|Art. 8"]],
    ["Art 7 Abs 1 B-VG", ["B-VG|Art. 7 Abs 1"]],
    ["§ 879 Abs 3 ABGB", ["ABGB|§ 879 Abs 3"]],
    ["§ 7 lit a MRG", ["MRG|§ 7 lit a"]],
    ["§ 1 Abs 1 Satz 2 BGB", ["BGB|§ 1 Abs 1 Satz 2"]],
    ["§ 1 Abs. 2 S. 1 BGB", ["BGB|§ 1 Abs. 2 S. 1"]],
    ["Art. 6 Abs. 1 UAbs. 1 lit. b DSGVO", ["DSGVO|Art. 6 Abs. 1 UAbs. 1 lit. b"]],
    ["§ 879 Abs 3 iVm § 864a ABGB", ["ABGB|§ 879 Abs 3", "ABGB|§ 864a"]],
    ["§ 879 Abs 3 i.V.m. § 864a ABGB", ["ABGB|§ 879 Abs 3", "ABGB|§ 864a"]],
    ["§ 2 Z 3 UStG", ["UStG|§ 2 Z 3"]],
    ["§ 6 Abs 1 und 2 KSchG", ["KSchG|§ 6 Abs 1 und 2"]],
    ["§ 16 EStG 1988", ["EStG 1988|§ 16"]],
    ["§ 5 ZPO", ["ZPO|§ 5"]],
    ["nach § 5 und dann", []],
  ];

  test.each(cases)("%s", (text, expected) => {
    const got = extractStatuteCitations(text).map((c) => `${c.code}|${c.paragraph}`);
    expect(got).toEqual(expected);
  });

  test("no citation ever carries a subdivision word as its statute", () => {
    const text = cases.map(([t]) => t).join(". ");
    for (const c of extractStatuteCitations(text)) {
      expect(["Abs", "Absatz", "Satz", "Z", "lit", "Nr", "UAbs", "Ziff"]).not.toContain(c.code);
    }
  });
});

describe("linkCitationsInHtml — AT citation grammar", () => {
  const gc = (paragraph: string) => ({
    code: "ABGB",
    paragraph,
    verified: true,
    source_url: "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen",
  });

  test("links a list citation when one of its norms is verified", () => {
    const out = linkCitationsInHtml("<p>§§ 1295, 1299 ABGB</p>", [gc("§ 1299")]);
    expect(out).toContain('data-paragraph="§ 1299"');
    expect(out).toContain(">§§ 1295, 1299 ABGB</a>");
  });

  test("links a citation with subdivisions", () => {
    const out = linkCitationsInHtml("<p>§ 6 Abs 1 Z 5 KSchG</p>", [
      { ...gc("§ 6 Abs 1 Z 5"), code: "KSchG" },
    ]);
    expect(out).toContain(">§ 6 Abs 1 Z 5 KSchG</a>");
  });
});
