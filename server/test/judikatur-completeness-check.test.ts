import { describe, expect, test } from "bun:test";
import { COURTS, completenessRow, parseHits } from "../scripts/judikatur-completeness-check.ts";

describe("parseHits", () => {
  test("reads the RIS OGD Hits field", () => {
    expect(
      parseHits({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "287209" } } } })
    ).toBe(287209);
  });

  test("a missing or malformed field is 0, not NaN", () => {
    expect(parseHits({})).toBe(0);
    expect(parseHits(null)).toBe(0);
    expect(parseHits({ OgdSearchResult: {} })).toBe(0);
    expect(
      parseHits({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "not-a-number" } } } })
    ).toBe(0);
  });
});

describe("completenessRow", () => {
  test("full coverage is 100%, no gap", () => {
    expect(completenessRow(1000, 1000)).toEqual({ pct: 100, gap: 0 });
  });

  test("partial coverage rounds to one decimal and reports the real gap", () => {
    // The actual BVwG shape measured 2026-09-21: DB has far fewer pages
    // than RIS lists — this is the exact case the tool exists to catch.
    expect(completenessRow(287209, 34373)).toEqual({ pct: 12, gap: 252836 });
  });

  test("more in the DB than RIS currently lists is not silently clamped to 100%", () => {
    // Can legitimately happen (RIS total moves between our query and a
    // slower DB count) — the tool should show it, not hide it.
    expect(completenessRow(100, 105)).toEqual({ pct: 105, gap: -5 });
  });

  test("zero on both sides is reported as complete, not divide-by-zero", () => {
    expect(completenessRow(0, 0)).toEqual({ pct: 100, gap: 0 });
  });

  test("RIS reports nothing but we somehow have pages is 0%, not 100%", () => {
    expect(completenessRow(0, 50)).toEqual({ pct: 0, gap: -50 });
  });
});

describe("COURTS", () => {
  test("every court fetch-all-at-judikatur.ts covers is present here too", () => {
    // Keeping this list in sync with the live fetcher is the whole point —
    // an audit that silently drops a court gives false reassurance.
    const expected = [
      "ogh",
      "vwgh",
      "vfgh",
      "bvwg",
      "lvwg",
      "asylgh",
      "uvs",
      "dsk",
      "gbk",
      "pvak",
      "dok",
      "ubas",
      "umse",
    ];
    expect(Object.keys(COURTS).sort()).toEqual(expected.sort());
  });

  test("every court has a distinct source_id (no accidental collision)", () => {
    const ids = Object.values(COURTS).map((c) => c.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
