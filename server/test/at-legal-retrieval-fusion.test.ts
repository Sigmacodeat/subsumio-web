import { describe, expect, test } from "bun:test";
import type { SearchResult } from "../src/core/types.ts";
import { fuseLegalSearchResults } from "../src/eval/at-legal-retrieval/fusion.ts";

function hit(slug: string): SearchResult {
  return {
    slug,
    page_id: 1,
    title: slug,
    type: "law",
    chunk_text: "",
    chunk_source: "compiled_truth",
    chunk_id: 1,
    chunk_index: 0,
    score: 0,
    stale: false,
    source_id: "law-at",
  } as SearchResult;
}

describe("AT legal retrieval fusion", () => {
  test("promotes results corroborated by original and expanded queries", () => {
    const fused = fuseLegalSearchResults(
      [hit("original-only"), hit("corroborated")],
      [hit("corroborated"), hit("expanded-only")],
      3
    );
    expect(fused.map((r) => r.slug)).toEqual([
      "corroborated",
      "original-only",
      "expanded-only",
    ]);
  });

  test("preserves original-query priority for one-sided results", () => {
    const fused = fuseLegalSearchResults(
      [hit("original-1"), hit("original-2")],
      [hit("expanded-1"), hit("expanded-2")],
      4
    );
    expect(fused.map((r) => r.slug)).toEqual([
      "original-1",
      "original-2",
      "expanded-1",
      "expanded-2",
    ]);
  });

  test("deduplicates and enforces the requested limit", () => {
    const fused = fuseLegalSearchResults([hit("a"), hit("b")], [hit("a"), hit("c")], 2);
    expect(fused).toHaveLength(2);
    expect(new Set(fused.map((r) => r.slug)).size).toBe(2);
  });
});
