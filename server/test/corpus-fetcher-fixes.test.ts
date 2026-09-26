/**
 * Regression tests for the 2026-09-26 corpus gap fixes:
 *
 * 1. docClassOf: `type: "erlass"` (and the other Sonstige/Bezirke/Gemeinden
 *    docTypes the fetcher used to write) must map to statute — these docs
 *    carry a Behörden-geschaeftszahl, so the field fallback misclassified
 *    them as decision and the validator rejected them (4 bmerl Erlasse).
 *
 * 2. fetch-missing-sources: dedup by RIS document id, not filename —
 *    filename dedup wrote "-2" variants for every doc whose slug differed,
 *    duplicating the whole corpus on each "Nachholen" run.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { docClassOf, mapToCanonical, parseRaw } from "../scripts/normalize/normalize-corpus.ts";
import {
  docIdOfRawFile,
  scanExistingDocIds,
  extractContentUrls,
  extractMetadata,
  pdfToText,
  type SourceConfig,
} from "../scripts/fetch-missing-sources.ts";

describe("docClassOf: Sonstige docTypes are statutes, not decisions", () => {
  const fm = (type: string) => ({
    type,
    geschaeftszahl: "GZ: BMSGPK-2021-0.123.456",
  });

  test.each([
    "erlass",
    "kundmachung",
    "amtliche_verlautbarung",
    "strukturplan",
    "gemeinderecht",
    "staatsvertrag",
    "state_legislation",
    "law",
    "statute",
  ])('type "%s" + geschaeftszahl → statute', (t) => {
    expect(docClassOf(fm(t))).toBe("statute");
  });

  test.each(["court_decision", "judikatur", "decision"])(
    'type "%s" → decision',
    (t) => {
      expect(docClassOf(fm(t))).toBe("decision");
    }
  );

  test("literatur → literature", () => {
    expect(docClassOf(fm("literatur"))).toBe("literature");
  });

  test("no type + geschaeftszahl → decision (fallback unchanged)", () => {
    expect(docClassOf({ geschaeftszahl: "10 Ob 1/25" })).toBe("decision");
    expect(docClassOf({ court: "OGH" })).toBe("decision");
  });

  test("no type + no fields → statute", () => {
    expect(docClassOf({})).toBe("statute");
  });

  test("mapToCanonical: erlass file yields doc_class statute", () => {
    const raw = parseRaw(
      `---\ntitle: "Erlass"\ntype: "erlass"\ngeschaeftszahl: "BMSGPK-2021-0.123.456"\ndocument_id: "ERL_BKA_20260807_2026_0_658_833"\nsource_url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Erlaesse&Dokumentnummer=ERL_BKA_20260807_2026_0_658_833"\n---\n\nText des Erlasses.\n`
    );
    const canon = mapToCanonical(raw, "fallback");
    expect(canon.doc_class).toBe("statute");
    expect(canon.doc_id).toBe("ERL_BKA_20260807_2026_0_658_833");
    expect(canon.court).toBeNull();
  });
});

describe("fetch-missing-sources: doc-id dedup", () => {
  const dir = mkdtempSync(join(tmpdir(), "corpus-dedup-"));
  const write = (name: string, fm: string) =>
    writeFileSync(join(dir, name), `---\n${fm}\n---\n\nText.\n`);

  test("docIdOfRawFile reads document_id and Dokumentnummer", () => {
    write(
      "a.md",
      'document_id: "AVN_20260805_AVN_2026_17"\nsource_url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Avn&Dokumentnummer=AVN_20260805_AVN_2026_17"'
    );
    write(
      "b.md",
      'source_url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Dsk&Dokumentnummer=DSBT_20260115_2026_0_039_346_00"'
    );
    write("no-id.md", 'title: "ohne id"');
    writeFileSync(join(dir, "not-md.txt"), "ignore me");

    expect(docIdOfRawFile(join(dir, "a.md"))).toBe("AVN_20260805_AVN_2026_17");
    expect(docIdOfRawFile(join(dir, "b.md"))).toBe(
      "DSBT_20260115_2026_0_039_346_00"
    );
    expect(docIdOfRawFile(join(dir, "no-id.md"))).toBeNull();
    expect(docIdOfRawFile(join(dir, "missing.md"))).toBeNull();
  });

  test("percent-encoded Dokumentnummer is decoded", () => {
    write(
      "enc.md",
      'source_url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=X&Dokumentnummer=GEMRE_2020_Pr%c3%a4s_1"'
    );
    expect(docIdOfRawFile(join(dir, "enc.md"))).toBe("GEMRE_2020_Präs_1");
  });

  test("scanExistingDocIds indexes the whole dir", () => {
    const ids = scanExistingDocIds(dir);
    expect(ids.has("AVN_20260805_AVN_2026_17")).toBe(true);
    expect(ids.has("DSBT_20260115_2026_0_039_346_00")).toBe(true);
    expect(ids.size).toBe(3);
  });
});

describe("fetch-missing-sources: RIS extraction", () => {
  const dsk: SourceConfig = {
    endpoint: "Judikatur",
    applikation: "Dsk",
    outDir: "at-judikatur-dsk",
    label: "DSK",
    docType: "court_decision",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  };

  test("extractContentUrls: ContentReference array + pdf data type", () => {
    const dl = {
      ContentReference: [
        {
          ContentType: "MainDocument",
          Urls: {
            ContentUrl: [
              { DataType: "Xml", Url: "https://x/doc.xml" },
              { DataType: "Authentisch", Url: "https://x/doc.pdf" },
            ],
          },
        },
      ],
    };
    expect(extractContentUrls(dl)).toEqual({
      xmlUrl: "https://x/doc.xml",
      htmlUrl: "",
      pdfUrl: "https://x/doc.pdf",
    });
    expect(extractContentUrls({})).toBeNull();
    expect(
      extractContentUrls({
        ContentReference: { Urls: { ContentUrl: { DataType: "Html", Url: "https://x/d.html" } } },
      })
    ).toEqual({ xmlUrl: "", htmlUrl: "https://x/d.html", pdfUrl: "" });
  });

  test("extractMetadata: Dsk EntscheidendeBehoerde maps to gericht", () => {
    const meta = {
      Judikatur: {
        Dsk: { EntscheidendeBehoerde: "Datenschutzbehörde", Entscheidungsart: "Erkenntnis" },
      },
    };
    const out = extractMetadata(meta, dsk);
    expect(out.gericht).toBe("Datenschutzbehörde");
    expect(out.entscheidungsart).toBe("Erkenntnis");
  });

  test("extractMetadata: Gericht still wins when both present", () => {
    const meta = {
      Judikatur: {
        Justiz: { Gericht: "VfGH", EntscheidendeBehoerde: "Datenschutzbehörde" },
      },
    };
    expect(extractMetadata(meta, dsk).gericht).toBe("VfGH");
  });

  test("pdfToText: invalid input yields empty string, never throws", () => {
    expect(pdfToText(Buffer.from("not a pdf"))).toBe("");
  });
});
