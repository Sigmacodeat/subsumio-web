// @vitest-environment node

import { describe, test, expect } from "vitest";
import { buildRisNormUrl, parseNormRef } from "@/lib/ris-url";
import { extractStatuteCitations, linkCitationsInHtml } from "@/lib/citation-gate-client";
import type { GroundedCitation } from "@/lib/types";

describe("parseNormRef", () => {
  test("§ with Absatz and letter suffix", () => {
    expect(parseNormRef("§ 1295 Abs 2")).toEqual({ kind: "par", num: "1295" });
    expect(parseNormRef("§ 879a")).toEqual({ kind: "par", num: "879a" });
    expect(parseNormRef("§§ 1295 f")).toEqual({ kind: "par", num: "1295" });
  });

  test("articles", () => {
    expect(parseNormRef("Art. 7")).toEqual({ kind: "art", num: "7" });
    expect(parseNormRef("Artikel 10")).toEqual({ kind: "art", num: "10" });
  });

  test("no number → null", () => {
    expect(parseNormRef("§ ")).toBeNull();
  });
});

describe("buildRisNormUrl", () => {
  const abgb = { gesetzesnummer: "10001622", nor_id: "NOR12019037" };

  test("Bundesnorm → NormDokument in the version in force today", () => {
    expect(buildRisNormUrl(abgb, "§ 1295")).toBe(
      "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622&Paragraf=1295"
    );
  });

  test("article of a Bundesnorm uses Artikel=", () => {
    expect(buildRisNormUrl({ gesetzesnummer: "10000138", nor_id: "NOR1" }, "Art. 7")).toContain(
      "&Artikel=7"
    );
  });

  test("Landesnorm (LST doc id) → ELI, normalised to www + https", () => {
    const url = buildRisNormUrl(
      {
        gesetzesnummer: "20000502",
        doc_id: "LST40018031",
        eli: "http://ris.bka.gv.at/eli/lgbl/ST/1999/24/P36/LST40018031",
      },
      "§ 36"
    );
    expect(url).toBe("https://www.ris.bka.gv.at/eli/lgbl/ST/1999/24/P36/LST40018031");
  });

  test("source_url is served as HTML, not the raw XML", () => {
    expect(
      buildRisNormUrl(
        {
          source_url: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR1/NOR1.xml",
          doc_id: "X",
        },
        "§ 1"
      )
    ).toBe("https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR1/NOR1.html");
  });

  test("never links off the RIS host", () => {
    expect(buildRisNormUrl({ eli: "https://evil.example/eli/x", doc_id: "X" }, "§ 1")).toBeNull();
    expect(buildRisNormUrl({ source_url: "javascript:alert(1)", doc_id: "X" }, "§ 1")).toBeNull();
  });
});

describe("extractStatuteCitations — Austrian shapes", () => {
  const cites = (t: string) => extractStatuteCitations(t).map((c) => `${c.paragraph} ${c.code}`);

  test("ß, umlauts and hyphen in the abbreviation", () => {
    expect(cites("nach § 1 AußStrG und § 1 B-KUVG")).toEqual(["§ 1 AußStrG", "§ 1 B-KUVG"]);
  });

  test("Abs without a dot (Austrian style) is part of the paragraph, not the code", () => {
    expect(cites("gemäß § 5 Abs 1 StGB")).toEqual(["§ 5 Abs 1 StGB"]);
  });

  test("year in the title", () => {
    expect(cites("§ 16 EStG 1988 regelt")).toEqual(["§ 16 EStG 1988"]);
  });

  test("articles, with and without dot", () => {
    expect(cites("Art 7 B-VG und Art. 8 EMRK")).toEqual(["Art. 7 B-VG", "Art. 8 EMRK"]);
  });

  test("'Art' inside a word is not an article citation", () => {
    expect(cites("Die Vertragsart 5 ABGB")).toEqual([]);
  });
});

describe("linkCitationsInHtml", () => {
  const ris =
    "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622&Paragraf=1295";
  const grounded: GroundedCitation[] = [
    { code: "ABGB", paragraph: "§ 1295", verified: true, source_url: ris },
    { code: "ABGB", paragraph: "§ 879", verified: false },
  ];

  test("links a verified citation and escapes & in the href", () => {
    const out = linkCitationsInHtml("<p>Nach § 1295 ABGB haftet</p>", grounded);
    expect(out).toContain(
      'href="https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&amp;Gesetzesnummer=10001622&amp;Paragraf=1295"'
    );
    expect(out).toContain(">§ 1295 ABGB</a>");
  });

  test("unverified citations stay plain text", () => {
    expect(linkCitationsInHtml("<p>§ 879 ABGB</p>", grounded)).toBe("<p>§ 879 ABGB</p>");
  });

  test("never touches text inside existing links or code", () => {
    const html = '<a href="/x">§ 1295 ABGB</a><code>§ 1295 ABGB</code>';
    expect(linkCitationsInHtml(html, grounded)).toBe(html);
  });

  test("ignores a source_url that is not on the RIS host", () => {
    const bad: GroundedCitation[] = [
      { code: "ABGB", paragraph: "§ 1295", verified: true, source_url: "https://evil.example/" },
    ];
    expect(linkCitationsInHtml("<p>§ 1295 ABGB</p>", bad)).toBe("<p>§ 1295 ABGB</p>");
  });
});

describe("EUR-Lex links", () => {
  test("buildEurLexUrl keeps EUR-Lex documents and rejects everything else", async () => {
    const { buildEurLexUrl } = await import("@/lib/ris-url");
    expect(
      buildEurLexUrl("http://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679")
    ).toBe("https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679");
    expect(buildEurLexUrl("https://eur-lex.europa.eu.evil.example/x")).toBeNull();
    expect(buildEurLexUrl(undefined)).toBeNull();
  });

  test("official source label and phrase follow the host", async () => {
    const { officialSourceIn, officialSourceLabel, isOfficialUrl } =
      await import("@/lib/citation-gate-client");
    const eu = "https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679";
    expect(officialSourceLabel(eu)).toBe("EUR-Lex");
    expect(officialSourceIn(eu)).toBe("in EUR-Lex");
    expect(officialSourceIn("https://www.ris.bka.gv.at/x")).toBe("im RIS");
    expect(isOfficialUrl("https://example.com/")).toBe(false);
  });
});
