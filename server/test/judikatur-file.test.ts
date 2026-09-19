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

describe("validateBody: screenreader copies", () => {
  test('a decision containing the spoken form "römisch 40" is rejected', async () => {
    const { validateBody } = await import("../scripts/normalize/canonical-schema.ts");
    const dirty =
      "über die Beschwerde des XXXX, geb. XXXX, zu Recht erkannt:" +
      "Das Bundesverwaltungsgericht hat über die Beschwerde des römisch 40 , geb. römisch 40 , zu Recht erkannt. ".repeat(
        3
      );
    expect(validateBody(dirty, "decision").map((i) => i.code)).toContain("screenreader_copy");
  });

  test("clean anonymised text passes that rule", async () => {
    const { validateBody } = await import("../scripts/normalize/canonical-schema.ts");
    const clean =
      "Das Bundesverwaltungsgericht hat über die Beschwerde des XXXX, geb. XXXX, zu Recht erkannt. ".repeat(
        5
      );
    expect(validateBody(clean, "decision").map((i) => i.code)).not.toContain("screenreader_copy");
  });
});

describe("metadata backfill", () => {
  const NORMEN = ["VwGG §34 Abs1", "B-VG Art133 Abs4"];
  const RAW_OLD = `---
type: court_decision
court: Verwaltungsgerichtshof
case_number: Ra 2019/12/0005
source: ris-ogd
source_url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Vwgh&Dokumentnummer=JWT_2019120005_20190101X00"
---

# VwGH — Ra 2019/12/0005

Die Revision wird zurückgewiesen. Kosten: $ 0.
`;
  const CANON_OLD = `---
schema_version: 1
doc_id: JWT_2019120005_20190101X00
doc_class: decision
decision_type: null
cited_norms: []
legal_area: []
---

# VwGH — Ra 2019/12/0005

Die Revision wird zurückgewiesen.
`;

  test("raw file gains normen and decision type; the body stays byte-identical", async () => {
    const { patchRawNormen, hasCitedNorms } = await import("../scripts/judikatur-file.ts");
    const out = patchRawNormen(RAW_OLD, NORMEN, "Beschluss");
    expect(hasCitedNorms(RAW_OLD)).toBe(false);
    expect(hasCitedNorms(out)).toBe(true);
    expect(out.split("\n---\n")[1]).toBe(RAW_OLD.split("\n---\n")[1]);
    const canon = mapToCanonical(parseRaw(out), "x");
    expect(canon.cited_norms).toEqual(NORMEN);
    expect(canon.decision_type).toBe("Beschluss");
    // Idempotent: a second run changes nothing.
    expect(patchRawNormen(out, NORMEN, "Beschluss")).toBe(out);
  });

  test("canonical file gets a YAML list and stays valid", async () => {
    const { patchCanonicalNormen, hasCitedNorms } = await import("../scripts/judikatur-file.ts");
    const { load } = await import("js-yaml");
    const out = patchCanonicalNormen(CANON_OLD, NORMEN, "Beschluss");
    expect(hasCitedNorms(CANON_OLD)).toBe(false);
    expect(hasCitedNorms(out)).toBe(true);
    const fm = load(out.split("---")[1]) as Record<string, unknown>;
    expect(fm.cited_norms).toEqual(NORMEN);
    expect(fm.decision_type).toBe("Beschluss");
    expect(out.endsWith("Die Revision wird zurückgewiesen.\n")).toBe(true);
    expect(patchCanonicalNormen(out, NORMEN, "Beschluss")).toBe(out);
  });
});

describe("statute metadata from RIS body sections", () => {
  const NORM = `---
title: "2. Geschäftsverteilung der Volksanwaltschaft"
type: law
jurisdiction: at
gesetzesnummer: ""
nor_id: "NOR40270195"
source_url: "https://www.ris.bka.gv.at/eli/bgbl/ii/2025/126/P12/NOR40270195"
source_format: xml
---

# 2. Geschäftsverteilung der Volksanwaltschaft

## Kurztitel

2. Geschäftsverteilung der Volksanwaltschaft

## Kundmachungsorgan

BGBl. II Nr. 126/2025 aufgehoben durch BGBl. II Nr. 185/2026

## §/Artikel/Anlage

§ 12

## Inkrafttretensdatum

01.07.2025

## Außerkrafttretensdatum

10.07.2026

## Abkürzung

2. GeV der VA 2025

## Gesetzesnummer

20012918

## Text

§ 12. Die Geschäftsverteilung tritt in Kraft.
`;

  test("name, abbreviation, citation, validity and ELI reach the canonical schema", () => {
    const c = mapToCanonical(parseRaw(NORM), "x");
    expect(c.short_title).toBe("2. Geschäftsverteilung der Volksanwaltschaft");
    expect(c.abbr).toBe("2. GeV der VA 2025");
    expect(c.statute_id).toBe("20012918");
    expect(c.paragraph_ref).toBe("§ 12");
    expect(c.promulgation_organ).toContain("BGBl. II Nr. 126/2025");
    expect(c.in_force_from).toBe("2025-07-01");
    expect(c.in_force_to).toBe("2026-07-10");
    expect(c.eli).toBe("https://www.ris.bka.gv.at/eli/bgbl/ii/2025/126/P12/NOR40270195");
  });

  test("frontmatter values win over body sections", () => {
    const withAbbr = NORM.replace("type: law", 'type: law\nabbreviation: "GeV-VA"');
    expect(mapToCanonical(parseRaw(withAbbr), "x").abbr).toBe("GeV-VA");
  });

  test("decisions do not pick up statute sections", () => {
    const dec = NORM.replace("type: law", "type: court_decision\ncourt: VwGH\ncase_number: Ra 1/1");
    expect(mapToCanonical(parseRaw(dec), "x").abbr).toBeNull();
  });
});

describe("normalizer v3: identity and links", () => {
  test("doc_id follows the RIS URL the text came from; the other id is kept as alternate", () => {
    const raw = `---
type: court_decision
court: VwGH
case_number: Ra 2024/11/0169
id: ris-JWR_2024110169_20250429L03
source_url: https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Vwgh&Dokumentnummer=JWR_2024110169_20250429L01
---

## Rechtssatz

§ 47 Abs. 2a KFG 1967 verlangt die Glaubhaftmachung eines rechtlichen Interesses.
`;
    const c = mapToCanonical(parseRaw(raw), "x");
    expect(c.doc_id).toBe("JWR_2024110169_20250429L01");
    expect(c.doc_id_alt).toContain("JWR_2024110169_20250429L03");
  });

  test("percent-encoded umlauts in the URL are decoded", () => {
    const raw = `---
type: court_decision
source_url: https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19300128_OGH0002_000R%c3%84S00370_2900000_001
---

Text
`;
    expect(mapToCanonical(parseRaw(raw), "x").doc_id).toBe(
      "JJR_19300128_OGH0002_000RÄS00370_2900000_001"
    );
  });

  test("an API query link becomes the document page; literal \\t escapes are removed", () => {
    const raw = `---
type: law
nor_id: NOR30000281
case_number: "VGW-111/093/14138/2021\\\\t"
source_url: https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Gesetzesnummer=20000249
---

§ 1. Text
`;
    const c = mapToCanonical(parseRaw(raw), "x");
    expect(c.source_url).toBe(
      "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR30000281/NOR30000281.html"
    );
  });

  test("clean() drops literal escape sequences", async () => {
    const { clean } = await import("../scripts/normalize/normalize-corpus.ts");
    expect(clean("VGW-111/093/14138/2021\\t")).toBe("VGW-111/093/14138/2021");
  });
});
