import { describe, expect, test } from "bun:test";
import { textRefsOf } from "../scripts/fetch-entscheidungstexte.ts";

describe("textRefsOf", () => {
  test("collects decision texts from any court block, ignores Rechtssätze", () => {
    const ref = {
      Data: {
        Metadaten: {
          Judikatur: {
            Dokumenttyp: "Rechtssatz",
            Justiz: {
              Entscheidungstexte: {
                item: [
                  {
                    Geschaeftszahl: "24 Ds 14/22a",
                    Entscheidungsdatum: "2022-12-06",
                    Gericht: "OGH",
                    DokumentUrl:
                      "https://ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20221206_OGH0002_0240DS00014_22A0000_000",
                  },
                  { Geschaeftszahl: "x", DokumentUrl: "https://x/?Dokumentnummer=JJR_1" },
                ],
              },
            },
          },
        },
      },
    };
    expect(textRefsOf(ref)).toEqual([
      {
        dokNr: "JJT_20221206_OGH0002_0240DS00014_22A0000_000",
        gz: "24 Ds 14/22a",
        date: "2022-12-06",
        court: "OGH",
        note: undefined,
      },
    ]);
  });

  test("a single item (not an array) and a VwGH block work too", () => {
    const ref = {
      Data: {
        Metadaten: {
          Judikatur: {
            Vwgh: {
              Entscheidungstexte: {
                item: { Geschaeftszahl: "Ra 1/1", DokumentUrl: "https://x/?Dokumentnummer=JWT_1" },
              },
            },
          },
        },
      },
    };
    expect(textRefsOf(ref).map((t) => t.dokNr)).toEqual(["JWT_1"]);
  });
});
