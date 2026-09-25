// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  compareParagraphLabels,
  computeLawCoverage,
  computeLawDetail,
  lawOfficialUrl,
  lawSourceByParam,
  lawStatusFromParam,
  normOfficialUrl,
  parseRisInforceIndex,
  type DbLawAgg,
  type DbLawDoc,
  type DbLawPage,
  lawKeyFor,
} from "./law-coverage";
import { corpusFileCandidatesForSlug, corpusFileForSlug } from "./law-coverage-server";

const INDEX_SAMPLE = [
  { nor: "NOR1", gnr: "10001", kurztitel: "Testgesetz", abk: "TG", apa: "§ 1" },
  { nor: "NOR2", gnr: "10001", kurztitel: "Testgesetz", abk: "TG", apa: "§ 2" },
  { nor: "NOR3", gnr: "10001", kurztitel: "Testgesetz", abk: "TG", apa: "§ 3" },
  { nor: "NOR0", gnr: "10001", kurztitel: "Testgesetz", abk: "TG", apa: "§ 0" },
  { nor: "NOR10", gnr: "20002", kurztitel: "Anderes Gesetz", abk: "AG", apa: "§ 1" },
  { nor: "NOR11", gnr: "20002", kurztitel: "Anderes Gesetz", abk: "AG", apa: "§ 2" },
  { nor: "NOR20", gnr: "30003", kurztitel: "Fehlendes Gesetz", abk: "FG", apa: "§ 1" },
]
  .map((d) => JSON.stringify(d))
  .join("\n");

describe("parseRisInforceIndex", () => {
  test("gruppiert Dokumente pro gnr und überspringt §-0-Deckblätter", () => {
    const idx = parseRisInforceIndex(INDEX_SAMPLE);
    expect(idx.size).toBe(3);
    const tg = idx.get("10001")!;
    expect(tg.docs.size).toBe(3); // NOR0 (§ 0) ausgeschlossen
    expect(tg.docs.has("NOR0")).toBe(false);
    expect(tg.abk).toBe("TG");
    expect(tg.kurztitel).toBe("Testgesetz");
    expect(tg.docs.get("NOR2")).toBe("§ 2");
  });

  test("ignoriert kaputte/leere Zeilen", () => {
    const idx = parseRisInforceIndex(`${INDEX_SAMPLE}\n{kaputt\n\n`);
    expect(idx.size).toBe(3);
  });

  test("Zeilen ohne nor/gnr werden übersprungen", () => {
    const idx = parseRisInforceIndex(
      JSON.stringify({ gnr: "1" }) + "\n" + JSON.stringify({ nor: "X" })
    );
    expect(idx.size).toBe(0);
  });

  test("Legacy-Schema: `id` wird als nor gelesen (Landesrecht-XML-Fetcher)", () => {
    const idx = parseRisInforceIndex(
      JSON.stringify({ id: "NOR-LR-1", gnr: "9001", apa: "§ 5" }) +
        "\n" +
        JSON.stringify({ nor: "NOR-LR-2", gnr: "9001", apa: "§ 6" })
    );
    const g = idx.get("9001")!;
    expect(g.docs.has("NOR-LR-1")).toBe(true);
    expect(g.docs.has("NOR-LR-2")).toBe(true);
    expect(g.docs.get("NOR-LR-1")).toBe("§ 5");
  });
});

describe("computeLawCoverage", () => {
  const index = parseRisInforceIndex(INDEX_SAMPLE);
  const docs: DbLawDoc[] = [
    { key: "10001", doc: "NOR1" },
    { key: "10001", doc: "NOR2" },
    { key: "10001", doc: "NOR3" },
    { key: "20002", doc: "NOR10" },
    { key: "99999", doc: "NOR99" }, // nur in DB, nicht im Index
  ];
  const aggs: DbLawAgg[] = [
    { key: "10001", pages: 3, chunks: 9, embedded: 9, abbr: null, title: null },
    { key: "20002", pages: 1, chunks: 4, embedded: 2, abbr: null, title: null },
    { key: "99999", pages: 1, chunks: 1, embedded: 0, abbr: "alt", title: "Altgesetz" },
  ];

  const { rows, totals } = computeLawCoverage(index, docs, aggs);

  test("Status: complete / partial / missing / db-only", () => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get("10001")!.status).toBe("complete");
    expect(byKey.get("20002")!.status).toBe("partial");
    expect(byKey.get("30003")!.status).toBe("missing");
    expect(byKey.get("99999")!.status).toBe("db-only");
  });

  test("Missing-Liste trägt nor + §-Label", () => {
    const partial = rows.find((r) => r.key === "20002")!;
    expect(partial.missingCount).toBe(1);
    expect(partial.missingDocs).toEqual([{ nor: "NOR11", apa: "§ 2" }]);
    expect(partial.wanted).toBe(2);
    expect(partial.have).toBe(1);
  });

  test("embedPct aus Chunks, null bei 0 Chunks", () => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get("20002")!.embedPct).toBe(50);
    expect(byKey.get("30003")!.embedPct).toBeNull();
  });

  test("Totals aggregieren alle Stufen", () => {
    expect(totals.laws).toBe(4);
    expect(totals.complete).toBe(1);
    expect(totals.partial).toBe(1);
    expect(totals.missing).toBe(1);
    expect(totals.extra).toBe(1);
    expect(totals.docsWanted).toBe(6);
    expect(totals.docsHave).toBe(5); // 3+1+0+1(db-only have)
    expect(totals.docsMissing).toBe(2); // NOR11 + NOR20
  });

  test("Sortierung: missing → partial → complete → db-only", () => {
    expect(rows.map((r) => r.key)).toEqual(["30003", "20002", "10001", "99999"]);
  });

  test("ohne Index: alle DB-Aggregate db-only", () => {
    const { rows: r2, totals: t2 } = computeLawCoverage(null, docs, aggs);
    expect(r2.every((r) => r.status === "db-only")).toBe(true);
    expect(t2.docsWanted).toBe(0);
    expect(t2.extra).toBe(3);
  });

  test("missingDocs wird auf 50 gekappt und markiert", () => {
    const bigIndex = parseRisInforceIndex(
      Array.from({ length: 60 }, (_, i) =>
        JSON.stringify({ nor: `N${i}`, gnr: "BIG", kurztitel: "Big", abk: "B", apa: `§ ${i + 1}` })
      ).join("\n")
    );
    const { rows: r3 } = computeLawCoverage(bigIndex, [], []);
    const big = r3.find((r) => r.key === "BIG")!;
    expect(big.missingCount).toBe(60);
    expect(big.missingDocs).toHaveLength(50);
    expect(big.missingTruncated).toBe(true);
  });
});

describe("compareParagraphLabels", () => {
  test("natürliche Reihenfolge: § 2 < § 2a < § 10 < Art. 1 < Anl. 1", () => {
    const labels = ["Anl. 1", "§ 10", "Art. 1", "§ 2a", "§ 2", "§§ 3"];
    expect([...labels].sort(compareParagraphLabels)).toEqual([
      "§ 2",
      "§ 2a",
      "§§ 3",
      "§ 10",
      "Art. 1",
      "Anl. 1",
    ]);
  });
});

describe("computeLawDetail", () => {
  const index = parseRisInforceIndex(INDEX_SAMPLE);
  const pg = (doc: string | null, label: string | null = null): DbLawPage => ({
    doc,
    label,
    slug: `legal/statutes/at/tg/${doc ?? "x"}`,
    title: null,
    chunks: 1,
    embedded: 1,
    updated_at: null,
  });

  test("ungekürzte Fehlliste, gespeicherte §§ mit Index-Label, Rest als extra", () => {
    const d = computeLawDetail(index.get("10001")!, [pg("NOR2"), pg("NOR99", "§ 99"), pg("NOR2")])!;
    expect(d.status).toBe("partial");
    expect(d.wanted).toBe(3);
    expect(d.present.map((p) => p.label)).toEqual(["§ 2"]); // Dublette zählt einmal
    expect(d.missing.map((m) => m.apa)).toEqual(["§ 1", "§ 3"]);
    expect(d.extra.map((p) => p.doc)).toEqual(["NOR99"]);
  });

  test("ohne Index: alles Gespeicherte, Status db-only; weder Soll noch Ist → null", () => {
    expect(
      computeLawDetail(null, [pg("p-2", "§ 2"), pg("p-1", "§ 1")])!.present.map((p) => p.label)
    ).toEqual(["§ 1", "§ 2"]);
    expect(computeLawDetail(null, [])).toBeNull();
  });
});

describe("amtliche Adressen und URL-Parameter", () => {
  test("Bundesrecht: Gesetz und einzelne Norm", () => {
    expect(lawOfficialUrl("law-at-normen", "10001622")?.url).toBe(
      "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622"
    );
    expect(normOfficialUrl("law-at-normen", "NOR12345678")).toBe(
      "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR12345678/NOR12345678.html"
    );
  });

  test("Landesrecht: Bundesland aus dem Präfix der Dokumentnummer", () => {
    expect(lawOfficialUrl("law-at-landesrecht", "20000123", "LWI40001234")?.url).toBe(
      "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=LrW&Gesetzesnummer=20000123"
    );
    expect(normOfficialUrl("law-at-landesrecht", "LNO40001234")).toBe(
      "https://www.ris.bka.gv.at/Dokumente/LrNO/LNO40001234/LNO40001234.html"
    );
    expect(lawOfficialUrl("law-at-landesrecht", "20000123", null)).toBeNull();
  });

  test("Deutschland: gesetze-im-internet.de; unbekannte Formen → null", () => {
    expect(lawOfficialUrl("law-de", "bgb")?.url).toBe("https://www.gesetze-im-internet.de/bgb/");
    expect(normOfficialUrl("law-de", "p-1")).toBeNull();
    expect(normOfficialUrl("law-at-normen", "javascript:alert(1)")).toBeNull();
  });

  test("Quellen- und Status-Parameter", () => {
    expect(lawSourceByParam("landesrecht")?.id).toBe("law-at-landesrecht");
    expect(lawSourceByParam("x")).toBeNull();
    expect(lawStatusFromParam("unvollstaendig")).toBe("partial");
    expect(lawStatusFromParam("quatsch")).toBeNull();
  });
});

describe("corpusFileForSlug", () => {
  test("Slug → normalisierte Datei je Quelle", () => {
    expect(corpusFileForSlug("law-at-normen", "legal/statutes/at/abgb/p-1044")).toBe(
      "at-normen/abgb/p-1044.md"
    );
    expect(
      corpusFileForSlug("law-at-landesrecht", "legal/statutes/at/landesrecht/gnr-20000476/art-1")
    ).toBe("at-landesrecht/gnr-20000476/art-1.md");
  });

  test("keine Datei für fremde Namensräume, Pfadausbrüche oder Quellen ohne Ablage", () => {
    expect(corpusFileForSlug("law-at-normen", "legal/statutes/at/landesrecht/x/art-1")).toBeNull();
    expect(corpusFileForSlug("law-at-normen", "legal/statutes/at/../../etc/passwd")).toBeNull();
    expect(corpusFileForSlug("law-de", "legal/statutes/de/bgb/p-1")).toBeNull();
  });
});

describe("corpusFileCandidatesForSlug", () => {
  it("Bundesrecht has exactly one place", () => {
    expect(corpusFileCandidatesForSlug("law-at-normen", "legal/statutes/at/abgb/p-1044")).toEqual([
      "at-normen/abgb/p-1044.md",
    ]);
  });

  it("Landesrecht is also looked up in every Bundesland folder (the slug has no state)", () => {
    const c = corpusFileCandidatesForSlug(
      "law-at-landesrecht",
      "legal/statutes/at/landesrecht/gnr-20000248/p-34a"
    );
    expect(c[0]).toBe("at-landesrecht/gnr-20000248/p-34a.md");
    expect(c).toContain("at-landesrecht/ktn/gnr-20000248/p-34a.md");
    expect(c).toHaveLength(10);
  });

  it("rejects what corpusFileForSlug rejects", () => {
    expect(corpusFileCandidatesForSlug("law-de", "legal/statutes/de/bgb/p-1")).toEqual([]);
    expect(
      corpusFileCandidatesForSlug("law-at-landesrecht", "legal/statutes/at/landesrecht/../x")
    ).toEqual([]);
  });
});

describe("Landesrecht: Gesetzesnummern je Bundesland (Audit 2026-09-25)", () => {
  const lr = [
    { nor: "LST40017927", gnr: "10000001", apa: "§ 1" },
    { nor: "LTI40045780", gnr: "10000001", apa: "§ 1" },
    { nor: "LTI40045781", gnr: "10000001", apa: "§ 2" },
  ]
    .map((d) => JSON.stringify(d))
    .join("\n");

  test("dieselbe Nummer in zwei Ländern ergibt zwei Gesetze mit Land im Key", () => {
    const idx = parseRisInforceIndex(lr);
    expect([...idx.keys()].sort()).toEqual(["stmk-10000001", "tir-10000001"]);
    expect(idx.get("tir-10000001")?.docs.size).toBe(2);
    expect(lawKeyFor("NOR12139577", "10010980")).toBe("10010980");
  });

  test("zählt eine vorhandene Dokumentnummer auch ohne passende statute_id", () => {
    const idx = parseRisInforceIndex(lr);
    const { rows } = computeLawCoverage(
      idx,
      [
        { key: "tir-10000001", doc: "LTI40045780" },
        // Ältere Seite ohne statute_id — Dokument ist trotzdem da.
        { key: "", doc: "LTI40045781" },
      ],
      []
    );
    expect(rows.find((r) => r.key === "tir-10000001")).toMatchObject({
      have: 2,
      status: "complete",
    });
    expect(rows.find((r) => r.key === "stmk-10000001")).toMatchObject({
      have: 0,
      status: "missing",
    });
  });

  test("RIS-Link nutzt die nackte Nummer", () => {
    expect(lawOfficialUrl("law-at-landesrecht", "tir-10000001", "LTI40045780")?.url).toContain(
      "Gesetzesnummer=10000001"
    );
  });
});
