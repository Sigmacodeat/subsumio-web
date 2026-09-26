import { describe, expect, test } from "bun:test";
import {
  selectLegalVersionsAsOf,
  selectLegalVersionsAsOfFromEngine,
} from "../src/core/search/hybrid.ts";
import type { SearchResult } from "../src/core/types.ts";

const hit = (slug: string, score: number): SearchResult =>
  ({ slug, score, chunk_id: score, chunk_index: 0, chunk_text: slug }) as SearchResult;

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

  test("a canonical page in force only after the cutoff yields the archived version", () => {
    const canonical = { ...hit("legal/statutes/at/abgb/p-1295", 0.9), page_id: 7 };
    const result = selectLegalVersionsAsOf(
      [canonical, { ...hit("legal/statutes/at/abgb/p-1295--v-2019-05-01", 0.8), page_id: 8 }],
      "2020-01-01",
      new Map([[7, { in_force_from: "2025-01-01", in_force_to: null }]])
    );
    expect(result.map((item) => item.slug)).toEqual([
      "legal/statutes/at/abgb/p-1295--v-2019-05-01",
    ]);
  });

  test("the result's own in_force_from counts as well", () => {
    const canonical = {
      ...hit("legal/statutes/at/abgb/p-1295", 0.9),
      in_force_from: "2025-01-01",
    } as SearchResult;
    const result = selectLegalVersionsAsOf(
      [canonical, hit("legal/statutes/at/abgb/p-1295--v-2019-05-01", 0.8)],
      "2020-01-01"
    );
    expect(result.map((item) => item.slug)).toEqual([
      "legal/statutes/at/abgb/p-1295--v-2019-05-01",
    ]);
  });

  test("without an older version the canonical page stays, with its in-force date", () => {
    const canonical = { ...hit("legal/statutes/at/abgb/p-1295", 0.9), page_id: 7 };
    const result = selectLegalVersionsAsOf(
      [canonical],
      "2020-01-01",
      new Map([[7, { in_force_from: "2025-01-01", in_force_to: null }]])
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.in_force_from).toBe("2025-01-01");
  });

  test("the engine lookup feeds the selection", async () => {
    const engine = {
      getStatuteValidity: async () =>
        new Map([[7, { in_force_from: "2025-01-01", in_force_to: null }]]),
    } as unknown as Parameters<typeof selectLegalVersionsAsOfFromEngine>[0];
    const result = await selectLegalVersionsAsOfFromEngine(
      engine,
      [
        { ...hit("legal/statutes/at/abgb/p-1295", 0.9), page_id: 7 },
        { ...hit("legal/statutes/at/abgb/p-1295--v-2019-05-01", 0.8), page_id: 8 },
      ],
      "2020-01-01"
    );
    expect(result.map((item) => item.slug)).toEqual([
      "legal/statutes/at/abgb/p-1295--v-2019-05-01",
    ]);
  });

  test("rejects malformed cutoffs", () => {
    expect(() => selectLegalVersionsAsOf([], "2024-01")).toThrow(/YYYY-MM-DD/);
  });
});
