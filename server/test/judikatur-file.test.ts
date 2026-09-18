import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildMarkdown,
  cleanKeyword,
  decisionTypeOf,
  dokumentnummerOf,
  isAlreadyOnDisk,
  loadExistingDocs,
  rememberOnDisk,
} from "../scripts/judikatur-file.ts";
import { mapToCanonical, parseRaw } from "../scripts/normalize/normalize-corpus.ts";

const URL_BVWG =
  "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Bvwg&Dokumentnummer=BVWGT_20161227_G309_2126636_1_00";

// Shape of a real RIS OGD v2.6 search hit (BVwG G309 2126636-1).
const REF = {
  Data: {
    Metadaten: {
      Judikatur: {
        Dokumenttyp: "Text",
        Normen: { item: ["BEinstG §14 Abs1", "BEinstG §14 Abs2", "B-VG Art.133 Abs4"] },
        Bvwg: { Entscheidungsart: "Erkenntnis", Gericht: "Bundesverwaltungsgericht" },
      },
    },
  },
};

const DOC = {
  id: "BVWGT_20161227_G309_2126636_1_00",
  court: "Bundesverwaltungsgericht",
  date: "2016-12-27T00:00:00.000Z",
  az: "G309 2126636-1",
  ecli: "ECLI:AT:BVWG:2016:G309.2126636.1.00",
  legalArea: "Allgemein",
  keywords: ["Grad der Behinderung,<br/>Sachverständigengutachten"],
  normen: ["BEinstG §14 Abs1", "BEinstG §14 Abs2", "B-VG Art.133 Abs4"],
  decisionType: "Erkenntnis",
  text: "IM NAMEN DER REPUBLIK! …",
  url: URL_BVWG,
  title: "Bundesverwaltungsgericht — G309 2126636-1",
};

describe("judikatur-file", () => {
  test("decision type comes from the court's own metadata block", () => {
    expect(decisionTypeOf(REF)).toBe("Erkenntnis");
    expect(decisionTypeOf({})).toBeUndefined();
  });

  test("keywords lose RIS line breaks", () => {
    expect(cleanKeyword("a,<br/>b  <BR>c")).toBe("a, b c");
  });

  test("cited norms and decision type reach the canonical schema", () => {
    const md = buildMarkdown(DOC, "bvwg");
    const canon = mapToCanonical(parseRaw(md), "fallback");
    expect(canon.cited_norms).toEqual(DOC.normen);
    expect(canon.decision_type).toBe("Erkenntnis");
    expect(canon.source_url).toBe(URL_BVWG);
    expect(canon.ecli).toBe(DOC.ecli);
    expect(canon.keywords.join(" ")).not.toContain("<br");
  });

  test("no normen key when RIS lists none", () => {
    expect(buildMarkdown({ ...DOC, normen: [] }, "bvwg")).not.toContain("normen:");
  });

  test("document number is read from both RIS URL forms", () => {
    expect(dokumentnummerOf(URL_BVWG)).toBe("BVWGT_20161227_G309_2126636_1_00");
    expect(
      dokumentnummerOf("https://www.ris.bka.gv.at/Dokumente/Bvwg/BVWGT_1_00/BVWGT_1_00.html")
    ).toBe("BVWGT_1_00");
  });

  test("decisions saved under any earlier file name are recognised", () => {
    const dir = mkdtempSync(join(tmpdir(), "jud-"));
    // Older generation: no date prefix, identified only by its source_url.
    writeFileSync(join(dir, "g309-2126636-1.md"), buildMarkdown(DOC, "bvwg"));
    const existing = loadExistingDocs(dir);

    expect(
      isAlreadyOnDisk(existing, DOC.id, URL_BVWG, "2016-12-27-g309-2126636-1", "g309-2126636-1")
    ).toBe(true);
    // Same document number under a different name still counts.
    expect(isAlreadyOnDisk(existing, DOC.id, URL_BVWG, "x", "y")).toBe(true);
    expect(
      isAlreadyOnDisk(
        existing,
        "BVWGT_OTHER",
        "https://x/?Dokumentnummer=BVWGT_OTHER",
        "2020-01-01-w1",
        "w1"
      )
    ).toBe(false);

    rememberOnDisk(
      existing,
      "BVWGT_OTHER",
      "https://x/?Dokumentnummer=BVWGT_OTHER",
      "2020-01-01-w1",
      "w1"
    );
    expect(isAlreadyOnDisk(existing, "BVWGT_OTHER", "", "z", "z")).toBe(true);
  });
});
