/**
 * Statute metadata against the RIS in-force index (ris-meta.ts) — the rule
 * both the normalizer and the proof on /ops/corpus use. Every case below is
 * a real one from the 2026-09-26 measurement of the production database.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadRisMetaIndex,
  metaDiffs,
  parseRisMetaIndex,
  reconcileMeta,
  type MetaValues,
} from "../scripts/normalize/ris-meta.ts";
import { mapToCanonical, parseRaw } from "../scripts/normalize/normalize-corpus.ts";
import { markerPath, needsFullRenormalize } from "../scripts/normalized-import.ts";

const meta = (over: Partial<MetaValues>): MetaValues => ({
  short_title: null,
  abbr: null,
  promulgation_organ: null,
  in_force_from: null,
  in_force_to: null,
  region: null,
  paragraph_ref: null,
  ...over,
});

describe("metaDiffs / reconcileMeta", () => {
  test("missing Kurztitel and Abkürzung are filled from the index (LBG40016279)", () => {
    const ours = meta({ paragraph_ref: "§ 1" });
    const idx = meta({
      short_title: "2. Bgld. LVwgBG",
      abbr: "2. Bgld. LVwgBG",
      paragraph_ref: "§ 1",
    });
    expect(metaDiffs(ours, idx, "2026-08-06", "2026-09-23")).toEqual(["short_title", "abbr"]);
    expect(reconcileMeta(ours, idx, "2026-08-06", "2026-09-23")).toMatchObject({
      short_title: "2. Bgld. LVwgBG",
      abbr: "2. Bgld. LVwgBG",
    });
  });

  test("spelling-only differences are not errors (LWI40008398, NOR40065268)", () => {
    const zero = meta({ promulgation_organ: "LGBl. Nr. 03/1983" });
    expect(metaDiffs(zero, meta({ promulgation_organ: "LGBl. Nr. 3/1983" }), null, null)).toEqual(
      []
    );
    const space = meta({
      promulgation_organ: "BGBl.Nr. 696/1974 zuletzt geändert durch BGBl. II Nr. 177/2005",
    });
    const idx = meta({
      promulgation_organ: "BGBl. Nr. 696/1974 zuletzt geändert durch BGBl. II Nr. 177/2005",
    });
    expect(metaDiffs(space, idx, null, null)).toEqual([]);
    // Years and numbers with inner zeros stay distinct.
    expect(
      metaDiffs(
        meta({ promulgation_organ: "BGBl. I Nr. 10/2008" }),
        meta({ promulgation_organ: "BGBl. I Nr. 1/2008" }),
        null,
        null
      )
    ).toEqual(["promulgation_organ"]);
  });

  test("a stray 'Undefined' is an error and is removed (NOR40186084)", () => {
    const ours = meta({ promulgation_organ: "BGBl. I Nr. 83/2016 Undefined" });
    const idx = meta({ promulgation_organ: "BGBl. I Nr. 83/2016" });
    expect(metaDiffs(ours, idx, null, "2026-09-23")).toEqual(["promulgation_organ"]);
    expect(reconcileMeta(ours, idx, null, "2026-09-23").promulgation_organ).toBe(
      "BGBl. I Nr. 83/2016"
    );
  });

  test("a Kurztitel with foreign text is replaced (NOR40235035, RIS XML 2026-09-26)", () => {
    const ours = meta({
      short_title: "Lehrpläne der humanberuflichen Schulen sowie Bekanntmachung der Lehrpläne",
    });
    const idx = meta({ short_title: "Lehrpläne der humanberuflichen Schulen" });
    expect(reconcileMeta(ours, idx, "2026-08-06", "2026-09-23").short_title).toBe(
      "Lehrpläne der humanberuflichen Schulen"
    );
    // NOR40279920: RIS itself says "Altlastensanierungsgesetz A" — stays.
    const a = meta({ short_title: "Altlastensanierungsgesetz A" });
    expect(
      reconcileMeta(a, meta({ short_title: "Altlastensanierungsgesetz" }), null, null).short_title
    ).toBe("Altlastensanierungsgesetz A");
  });

  test("our copy fetched after the index crawl is the newer RIS state (LBG40027164)", () => {
    const ours = meta({ promulgation_organ: "LGBl.Nr. 77/2024 aufgehoben durch LGBl.Nr. 84/2025" });
    const idx = meta({ promulgation_organ: "LGBl.Nr. 77/2024" });
    expect(metaDiffs(ours, idx, "2026-09-24", "2026-09-23")).toEqual([]);
    expect(metaDiffs(ours, idx, "2026-09-01", "2026-09-23")).toEqual(["promulgation_organ"]);
  });

  test("the index saying nothing is no evidence against us (LBG40027165 in_force_to)", () => {
    const ours = meta({ in_force_to: "2025-12-31", abbr: "BewHG" });
    expect(metaDiffs(ours, meta({}), null, null)).toEqual([]);
    expect(reconcileMeta(ours, meta({}), null, null)).toEqual(ours);
  });
});

describe("index loading", () => {
  test("§ 0 cover sheets are skipped; values are trimmed", () => {
    const m = parseRisMetaIndex(
      [
        { nor: "NOR0", apa: "§ 0", kurztitel: "X" },
        { nor: "NOR1", apa: "§ 1", kurztitel: " Privatschulgesetz ", ausserkraft: null },
      ]
        .map((l) => JSON.stringify(l))
        .join("\n")
    );
    expect([...m.keys()]).toEqual(["NOR1"]);
    expect(m.get("NOR1")!.values.short_title).toBe("Privatschulgesetz");
  });
  test("only at-normen and at-landesrecht have an index", () => {
    const dir = mkdtempSync(join(tmpdir(), "rm-"));
    writeFileSync(
      join(dir, "ris-inforce.jsonl"),
      JSON.stringify({ nor: "NOR1", apa: "§ 1" }) + "\n"
    );
    expect(loadRisMetaIndex(dir, "at-normen")!.byDoc.size).toBe(1);
    expect(loadRisMetaIndex(dir, "at-landesrecht")).toBeNull();
    expect(loadRisMetaIndex(dir, "at-judikatur")).toBeNull();
  });
});

describe("normalizer v6 — statute metadata", () => {
  // The raw file of a repaired state norm: the repair wrote the number as title.
  const repaired = parseRaw(
    [
      "---",
      'title: "LBG40016037"',
      "type: law",
      'gesetzesnummer: "20000316"',
      'nor_id: "LBG40016037"',
      'paragraph: "§ 9"',
      'source_url: "https://www.ris.bka.gv.at/Dokumente/Landesnormen/LBG40016037/LBG40016037.xml"',
      'retrieved_at: "2026-09-24"',
      'content_hash: "b7ed73314479bb07"',
      "---",
      "",
      "## Kurztitel",
      "",
      "Bgld. Beispielgesetz",
      "",
      "## Text",
      "",
      "§ 9. Text.",
      "",
    ].join("\n")
  );

  test("a document number is never the title", () => {
    const c = mapToCanonical(repaired, "fallback");
    expect(c.short_title).toBe("Bgld. Beispielgesetz");
    expect(c.title).toBe("Bgld. Beispielgesetz");
  });

  test("`statute:` is the Kurztitel", () => {
    const c = mapToCanonical(
      parseRaw(
        '---\ntitle: "Anl. 5 BilDokV 2021"\ntype: law\nnor_id: "NOR40276237"\nstatute: "Bildungsdokumentationsverordnung 2021"\nsource_url: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40276237/NOR40276237.xml"\ncontent_hash: "7d6aff686ce6e5cd"\n---\n\nText.\n'
      ),
      "x"
    );
    expect(c.short_title).toBe("Bildungsdokumentationsverordnung 2021");
    expect(c.title).toBe("Anl. 5 BilDokV 2021");
  });

  test("the index fills Abkürzung and end date the fetcher never stored (LSB40027873)", () => {
    const idx = {
      byDoc: parseRisMetaIndex(
        JSON.stringify({
          nor: "LBG40016037",
          apa: "§ 9",
          kurztitel: "Bgld. Beispielgesetz",
          abk: "BBG",
          ausserkraft: "2027-06-30",
          kundmachungsorgan: "LGBl. Nr. 1/2020",
          region: "Burgenland",
        })
      ),
      indexDate: "2026-09-23",
    };
    const c = mapToCanonical(repaired, "fallback", idx);
    expect(c.abbr).toBe("BBG");
    expect(c.in_force_to).toBe("2027-06-30");
    expect(c.promulgation_organ).toBe("LGBl. Nr. 1/2020");
    expect(c.title).toBe("Bgld. Beispielgesetz");
  });
});

describe("full renormalize after a rule change", () => {
  test("once per listed corpus, then the marker holds", () => {
    const root = mkdtempSync(join(tmpdir(), "rn-"));
    expect(needsFullRenormalize(root, "at-normen")).toBe(true);
    expect(needsFullRenormalize(root, "at-judikatur-vwgh")).toBe(false);
    mkdirSync(join(root, "_normalized", "_state"), { recursive: true });
    writeFileSync(markerPath(root, "at-normen"), "6");
    expect(needsFullRenormalize(root, "at-normen")).toBe(false);
    writeFileSync(markerPath(root, "at-normen"), "5");
    expect(needsFullRenormalize(root, "at-normen")).toBe(true);
  });
});

describe("RIS evidence on Kurztitel suffixes", () => {
  test("document suffixes are consistent; a cut-off title and foreign text are not", () => {
    const idx = (k: string) => meta({ short_title: k });
    const ours = (k: string) => meta({ short_title: k });
    // Live RIS XML 2026-09-26: the document carries these suffixes.
    for (const [o, i] of [
      ["Berufsausbildungsgesetz ÜR", "Berufsausbildungsgesetz"],
      [
        "Statut für die Landeshauptstadt Linz 1992 ÜR 2012",
        "Statut für die Landeshauptstadt Linz 1992",
      ],
      ["Zentrale Gegenparteien-Vollzugsgesetz EG/EU", "Zentrale Gegenparteien-Vollzugsgesetz"],
      ["Europäisches Rechtsanwaltsgesetz A", "Europäisches Rechtsanwaltsgesetz"],
      ["Zivildienstgesetz 1986 BVG", "Zivildienstgesetz 1986"],
    ])
      expect(metaDiffs(ours(o!), idx(i!), null, null)).toEqual([]);
    // NOR40235035: RIS XML has no "sowie …"; NOR40104036: ours is cut off.
    expect(
      metaDiffs(
        ours("Lehrpläne der humanberuflichen Schulen sowie Bekanntmachung der Lehrpläne"),
        idx("Lehrpläne der humanberuflichen Schulen"),
        null,
        null
      )
    ).toEqual(["short_title"]);
    const cut = ours("Verbindliche Festsetzung von Erlebenswahrscheinlichkeiten");
    const full = idx("Verbindliche Festsetzung von Erlebenswahrscheinlichkeiten zu");
    // Newer does not make a cut-off title right.
    expect(metaDiffs(cut, full, "2026-09-26", "2026-09-23")).toEqual(["short_title"]);
  });
});

describe("clean — escaped quotes", () => {
  test("a double-quoted YAML value loses its escapes (LBG40025887)", async () => {
    const { clean } = await import("../scripts/normalize/normalize-corpus.ts");
    expect(clean('"Entwicklungsprogramm \\"Unteres Pinka- und Stremtal\\""')).toBe(
      'Entwicklungsprogramm "Unteres Pinka- und Stremtal"'
    );
    // Unquoted values keep their backslashes.
    expect(clean("a\\b")).toBe("a\\b");
  });
});
