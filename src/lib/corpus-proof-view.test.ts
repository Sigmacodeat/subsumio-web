// @vitest-environment node
// Nachweis-Ansicht (/ops/corpus): Gruppierung nach Rechtsbereich, Summenprobe
// und die Trennung „bestätigt" vs. offen — nichts darf zusammenfließen.
import { describe, expect, it } from "vitest";
import { parseProof, toSyncRow, type SyncInventorySource } from "./corpus-sync-inventory";
import {
  byCategory,
  confirmedPct,
  groupByArea,
  isFullyConfirmed,
  rowMatches,
  sumCheck,
  totalCounts,
} from "./corpus-proof-view";
import { areaOfCorpus, risDocumentUrl } from "./corpus-areas";

const counts = (over: Partial<Record<string, number>> = {}) => ({
  confirmed: 0,
  mismatch: 0,
  defective: 0,
  unchecked: 0,
  importOpen: 0,
  fetchOpen: 0,
  unreachable: 0,
  ...over,
});

function src(over: Partial<SyncInventorySource>): SyncInventorySource {
  return {
    corpus: "at-normen",
    sourceId: "law-at-normen",
    inScope: true,
    historical: false,
    risSoll: null,
    risSollKind: null,
    risSollAt: null,
    rawFiles: 0,
    normalizedFiles: 0,
    diskDocs: 0,
    dbPages: 0,
    dbDocs: 0,
    dbPagesWithoutDocId: 0,
    missingOnDisk: 0,
    missingByReason: { open: 0, no_text: 0, not_found: 0, failed: 0 },
    diskNotInDb: 0,
    dbNotOnDisk: 0,
    dbHistorical: 0,
    notInRisSoll: null,
    aboveSoll: 0,
    ...over,
  };
}

const row = (over: Partial<SyncInventorySource>) =>
  toSyncRow(src(over), over.corpus ?? "x", undefined);

describe("groupByArea", () => {
  it("ordnet nach Stufenbau und Gerichtsbarkeit, Archiv und Ausland bleiben draußen", () => {
    const rows = [
      row({ corpus: "at-judikatur", sourceId: "law-at-judikatur" }),
      row({ corpus: "at-judikatur-vfgh", sourceId: "law-at-judikatur-vfgh" }),
      row({ corpus: "at-landesrecht", sourceId: "law-at-landesrecht" }),
      row({ corpus: "at-normen" }),
      row({ corpus: "at-judikatur-bvwg", sourceId: "law-at-judikatur-bvwg" }),
      row({ corpus: "at", sourceId: "law-at", historical: true }),
      row({ corpus: "de", sourceId: "law-de", inScope: false }),
      row({ corpus: "at-neu", sourceId: "law-at-neu" }),
    ];
    const g = groupByArea(rows);
    expect(g.map((x) => x.area.id)).toEqual([
      "bund",
      "land",
      "hoechstgerichte",
      "verwaltungsgerichte",
      "sonstiges",
    ]);
    // VfGH vor OGH — Rang innerhalb des Bereichs, nicht Alphabet.
    expect(g[2]!.rows.map((r) => r.corpus)).toEqual(["at-judikatur-vfgh", "at-judikatur"]);
  });

  it("zählt Quellen ohne Nachweis getrennt, nie als bestätigt", () => {
    const g = groupByArea([
      row({ proof: { ...parseProof({ counts: counts({ confirmed: 5 }) })! } }),
      row({ corpus: "at-staatsvertraege", sourceId: "law-at-staatsvertraege" }),
    ]);
    expect(g[0]!.counts.confirmed).toBe(5);
    expect(g[0]!.unmeasured).toBe(1);
    expect(rowMatches(null, "offen")).toBe(true);
    expect(rowMatches(null, "confirmed")).toBe(false);
  });
});

describe("Summenprobe und Kategorien", () => {
  it("Index-Soll: Summe der Töpfe muss genau das Soll sein", () => {
    const ok = row({
      risSoll: 10,
      risSollKind: "index",
      proof: parseProof({ sollExact: true, counts: counts({ confirmed: 7, fetchOpen: 3 }) }),
    });
    expect(sumCheck(ok)).toEqual({ ok: true, sum: 10, soll: 10 });
    const off = row({
      risSoll: 11,
      risSollKind: "index",
      proof: parseProof({ sollExact: true, counts: counts({ confirmed: 7, fetchOpen: 3 }) }),
    });
    expect(sumCheck(off)?.ok).toBe(false);
    // Trefferzahl: keine Probe möglich.
    expect(
      sumCheck(
        row({
          risSoll: 10,
          risSollKind: "hits",
          proof: parseProof({ sollExact: false, counts: counts({ confirmed: 7 }) }),
        })
      )
    ).toBeNull();
  });

  it("jede der vier Fragen bekommt nur ihre Töpfe", () => {
    const c = counts({
      confirmed: 90,
      mismatch: 1,
      defective: 2,
      unchecked: 3,
      importOpen: 4,
      fetchOpen: 5,
      unreachable: 6,
    });
    expect(byCategory(c)).toEqual({ confirmed: 90, wrong: 3, missing: 11, working: 7 });
    // Abgerundet: 99,99 % wird nie als 100 % angezeigt.
    expect(confirmedPct(counts({ confirmed: 9999, fetchOpen: 1 }))).toBe(99.9);
    expect(isFullyConfirmed(counts({ confirmed: 3 }))).toBe(true);
    expect(isFullyConfirmed(counts())).toBe(false);
  });

  it("Gesamtsumme = Summe der Bereiche", () => {
    const g = groupByArea([
      row({ proof: parseProof({ counts: counts({ confirmed: 2, mismatch: 1 }) }) }),
      row({
        corpus: "at-judikatur-vwgh",
        sourceId: "law-at-judikatur-vwgh",
        proof: parseProof({ counts: counts({ confirmed: 4, importOpen: 1 }) }),
      }),
    ]);
    expect(totalCounts(g)).toEqual(counts({ confirmed: 6, mismatch: 1, importOpen: 1 }));
  });
});

describe("parseProof", () => {
  it("ist defensiv: kaputte Einträge fallen weg, fehlende Zahlen werden 0", () => {
    const p = parseProof({
      counts: { confirmed: 3, mismatch: "x" },
      samples: { fetchOpen: [{ id: "NOR1", label: "ABGB § 1" }, { nope: 1 }, null] },
      laws: { "1": [1, 0, 0, 0, 0, 0, 0], "2": [1, 2] },
      parts: { wien: { counts: { confirmed: 1 } } },
    })!;
    expect(p.counts).toEqual(counts({ confirmed: 3 }));
    expect(p.samples.fetchOpen).toEqual([{ id: "NOR1", label: "ABGB § 1" }]);
    expect(Object.keys(p.laws!)).toEqual(["1"]);
    expect(p.parts!.wien!.counts.confirmed).toBe(1);
    expect(parseProof(undefined)).toBeUndefined();
    expect(parseProof({})).toBeUndefined();
  });

  it("die Sync-Zeile trägt den Nachweis ohne die große Gesetzesliste", () => {
    const r = row({
      proof: parseProof({ counts: counts({ confirmed: 1 }), laws: { "1": [1, 0, 0, 0, 0, 0, 0] } }),
    });
    expect(r.proof).not.toBeNull();
    expect("laws" in r.proof!).toBe(false);
  });
});

describe("corpus-areas", () => {
  it("unbekannte Quelle landet unter Sonstiges, verschwindet nie", () => {
    expect(areaOfCorpus("at-irgendwas").area).toBe("sonstiges");
  });
  it("RIS-Link nur, wo die Adresse sicher bekannt ist", () => {
    expect(risDocumentUrl("at-normen", "NOR40000001")).toContain("/Bundesnormen/NOR40000001/");
    expect(risDocumentUrl("at-judikatur-vwgh", "JWT_2020010001_1")).toContain("Abfrage=Vwgh");
    expect(risDocumentUrl("at-gemeinden", "GEM1")).toBeNull();
  });
});
