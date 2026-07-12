import { describe, expect, test } from "bun:test";
import { selectLegalVersionsAsOf } from "../src/core/search/hybrid.ts";
import type { SearchResult } from "../src/core/types.ts";

const hit = (slug: string, score: number): SearchResult =>
  ({ slug, score, chunk_id: score, chunk_index: 0, chunk_text: slug } as SearchResult);

describe("historical legal version selection", () => {
  test("selects the latest archived version before the cutoff", () => {
    const result = selectLegalVersionsAsOf(
      [
        hit("legal/statutes/at/abgb/p-1295--v-2020-01-01", 0.8),
        hit("legal/statutes/at/abgb/p-1295--v-2023-01-01", 0.9),
        hit("legal/statutes/at/abgb/p-1295--v-2025-01-01", 1.0),
      ],
      "2024-01-01"
    );
    expect(result.map((item) => item.slug)).toEqual([
      "legal/statutes/at/abgb/p-1295--v-2023-01-01",
    ]);
  });

  test("prefers the canonical current page when it is valid at the cutoff", () => {
    const result = selectLegalVersionsAsOf(
      [
        hit("legal/statutes/at/abgb/p-1295--v-2020-01-01", 0.9),
        hit("legal/statutes/at/abgb/p-1295", 0.8),
      ],
      "2024-01-01"
    );
    expect(result.map((item) => item.slug)).toEqual(["legal/statutes/at/abgb/p-1295"]);
  });

  test("rejects malformed cutoffs", () => {
    expect(() => selectLegalVersionsAsOf([], "2024-01")).toThrow(/YYYY-MM-DD/);
  });
});
