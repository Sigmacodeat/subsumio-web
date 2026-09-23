// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  computeLawCoverage,
  parseRisInforceIndex,
  type DbLawAgg,
  type DbLawDoc,
} from "./law-coverage";

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
