import { describe, expect, test } from "bun:test";
import { decisionIdentifiers } from "../src/core/search/citation-query.ts";
import { prependDecisionIdentifierHits } from "../src/core/search/hybrid.ts";
import type { SearchResult } from "../src/core/types.ts";

const ECLI = "ECLI:AT:OGH0002:2019:RS0132425";

const result = (over: Partial<SearchResult>): SearchResult =>
  ({
    slug: "legal/judikatur/at/x",
    page_id: 1,
    title: "OGH",
    type: "note",
    chunk_text: "…",
    chunk_source: "compiled_truth",
    chunk_id: 10,
    chunk_index: 0,
    score: 0.4,
    stale: false,
    ...over,
  }) as SearchResult;

describe("decisionIdentifiers", () => {
  test("finds an ECLI however it is written", () => {
    expect(decisionIdentifiers(`Was sagt ${ECLI}?`)).toEqual([ECLI]);
    expect(decisionIdentifiers(ECLI.toLowerCase())).toEqual([ECLI]);
  });

  test("finds a RIS document number", () => {
    expect(decisionIdentifiers("JJT_20190326_OGH0002_0100OB00015_19X0000_000")).toEqual([
      "JJT_20190326_OGH0002_0100OB00015_19X0000_000",
    ]);
  });

  test("a question in plain words carries no identifier", () => {
    expect(decisionIdentifiers("Wann verjährt ein Schadenersatzanspruch?")).toEqual([]);
    expect(decisionIdentifiers("RS0132425")).toEqual([]); // the keyword arm finds these
  });
});

describe("prependDecisionIdentifierHits", () => {
  const engineWith = (
    hits: Array<{ chunk_id: number; page_id: number }>,
    hydrate: SearchResult[] = []
  ) =>
    ({
      findChunksByDecisionIdentifier: async () => hits,
      // hydrateChunks() reaches for this when a hit is not in the result set.
      getChunksByIds: async () => hydrate,
    }) as never;

  test("a decision already in the results moves to the top", async () => {
    const results = [result({ chunk_id: 99, score: 0.9 }), result({ chunk_id: 10, score: 0.1 })];
    await prependDecisionIdentifierHits(engineWith([{ chunk_id: 10, page_id: 1 }]), ECLI, results);
    const hit = results.find((r) => r.chunk_id === 10)!;
    expect(hit.score).toBeGreaterThan(results.find((r) => r.chunk_id === 99)!.score);
  });

  test("without an identifier in the query nothing changes", async () => {
    const results = [result({ chunk_id: 99, score: 0.9 })];
    await prependDecisionIdentifierHits(
      engineWith([{ chunk_id: 10, page_id: 1 }]),
      "Verjährung",
      results
    );
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.9);
  });

  test("an engine without the lookup, or a failing one, leaves search untouched", async () => {
    const results = [result({ chunk_id: 99, score: 0.9 })];
    await prependDecisionIdentifierHits({} as never, ECLI, results);
    await prependDecisionIdentifierHits(
      {
        findChunksByDecisionIdentifier: async () => {
          throw new Error("db down");
        },
      } as never,
      ECLI,
      results
    );
    expect(results[0].score).toBe(0.9);
  });
});
