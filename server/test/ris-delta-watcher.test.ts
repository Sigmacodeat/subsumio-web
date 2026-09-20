import { describe, expect, test } from "bun:test";
import { buildJudikaturMarkdown, buildStatuteMarkdown } from "../scripts/ris-delta-watcher.ts";
import { mapToCanonical, parseRaw } from "../scripts/normalize/normalize-corpus.ts";
import type { DeltaDocument } from "../scripts/ris-delta.ts";

const XML =
  "<risdok><nutzdaten><absatz>Der Rechtssatz lautet so und nicht anders.</absatz></nutzdaten></risdok>";

// Shape of a RIS OGD v2.6 Judikatur search hit for an OGH Rechtssatz.
const RAW = {
  Data: {
    Metadaten: {
      Technisch: { ID: "JJR_20190326_OGH0002_0100OB00015_19X0000_001", Organ: "OGH" },
      Allgemein: {
        DokumentUrl:
          "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_20190326_OGH0002_0100OB00015_19X0000_001",
      },
      Judikatur: {
        Dokumenttyp: "Rechtssatz",
        Geschaeftszahl: { item: "10Ob15/19x" },
        Entscheidungsdatum: "2019-03-26",
        EuropeanCaseLawIdentifier: "ECLI:AT:OGH0002:2019:RS0132425",
        Normen: { item: ["ABGB §1295", "ABGB §1311"] },
        Schlagworte: "Schadenersatz; Rechtswidrigkeitszusammenhang",
        Justiz: {
          Gericht: "OGH",
          Rechtsgebiete: { item: "Zivilrecht" },
          Entscheidungstexte: {
            item: {
              DokumentUrl:
                "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20190326_OGH0002_0100OB00015_19X0000_000",
              Geschaeftszahl: "10Ob15/19x",
              Entscheidungsdatum: "2019-03-26",
            },
          },
        },
      },
    },
  },
};

function doc(over: Partial<DeltaDocument> = {}): DeltaDocument {
  return {
    id: "JJR_20190326_OGH0002_0100OB00015_19X0000_001",
    applikation: "Justiz",
    changedAt: "2026-09-18T00:00:00.000Z",
    dokumentUrl: RAW.Data.Metadaten.Allgemein.DokumentUrl,
    xmlUrl: null,
    htmlUrl: null,
    pdfUrl: null,
    kurztitel: null,
    gesetzesnummer: null,
    geschaeftszahl: "10Ob15/19x",
    artikelParagraphAnlage: null,
    inkrafttreten: null,
    ausserkrafttreten: null,
    abkuerzung: null,
    ...over,
  } as DeltaDocument;
}

describe("ris-delta-watcher", () => {
  test("a decision from the daily sync has the full-scan format: real date, ECLI, norms", () => {
    const canon = mapToCanonical(parseRaw(buildJudikaturMarkdown(doc({ raw: RAW }), XML)), "x");
    expect(canon.decision_date).toBe("2019-03-26");
    expect(canon.ecli).toBe("ECLI:AT:OGH0002:2019:RS0132425");
    expect(canon.cited_norms).toEqual(["ABGB §1295", "ABGB §1311"]);
    expect(canon.case_number).toBe("10Ob15/19x");
    expect(canon.source_url).toContain("JJR_20190326");
  });

  test("without RIS metadata the change date is never passed off as the decision date", () => {
    const canon = mapToCanonical(parseRaw(buildJudikaturMarkdown(doc(), XML)), "x");
    expect(canon.decision_date).toBe("2019-03-26");
    expect(canon.case_number).toBe("10Ob15/19x");
  });

  test("statutes carry the abbreviation", () => {
    const md = buildStatuteMarkdown(
      doc({
        id: "NOR40000001",
        applikation: "BrKons",
        abkuerzung: "ABGB",
        artikelParagraphAnlage: "§ 1295",
        kurztitel: "Allgemeines bürgerliches Gesetzbuch",
      }),
      XML
    );
    expect(md).toContain('abbreviation: "ABGB"');
  });
});
