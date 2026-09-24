// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  buildQualitySnapshot,
  computeAndStoreQuality,
  readLatestQuality,
  type SampleRow,
} from "./corpus-quality";

function fakePool(handler: (sql: string, params?: unknown[]) => unknown) {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => handler(sql, params)),
  } as unknown as Pool & { query: ReturnType<typeof vi.fn> };
}

const inventory = [
  { source_id: "law-at-normen", pages: 100, chunks: 1000, embedded: 250 },
  { source_id: "law-at-judikatur", pages: 50, chunks: 3000, embedded: 0 },
];

function cell(partial: Partial<SampleRow> & Pick<SampleRow, "source_id" | "n">): SampleRow {
  return {
    chunk_role: null,
    avg_len: 0,
    tiny: 0,
    small: 0,
    medium: 0,
    optimal: 0,
    large: 0,
    oversized: 0,
    ...partial,
  };
}

describe("buildQualitySnapshot", () => {
  it("takes exact counts from the inventory and scales the sample to them", () => {
    const sample: SampleRow[] = [
      cell({ source_id: "law-at-normen", chunk_role: "absatz", n: 10, avg_len: 400, optimal: 10 }),
      cell({ source_id: "law-at-judikatur", chunk_role: "full", n: 30, avg_len: 2000, large: 30 }),
    ];
    const s = buildQualitySnapshot(inventory, sample);
    // Exact numbers never come from the sample.
    expect(s.totalChunks).toBe(4000);
    expect(s.embeddedChunks).toBe(250);
    expect(s.embeddingCoveragePct).toBe(6.3);
    expect(s.sampledChunks).toBe(40);
    // 40 sampled → 4000 total = ×100.
    expect(s.roleDistribution).toEqual([
      { role: "full", count: 3000 },
      { role: "absatz", count: 1000 },
    ]);
    expect(s.lengthHistogram.find((b) => b.bucket === "optimal")?.count).toBe(1000);
    expect(s.lengthHistogram.find((b) => b.bucket === "large")?.count).toBe(3000);
    expect(s.lengthHistogram.find((b) => b.bucket === "tiny")?.count).toBe(0);
    // Weighted average over the sample: (10×400 + 30×2000) / 40.
    expect(s.avgLength).toBe(1600);
    // Per source: exact counts, sampled average, sorted by chunks.
    expect(s.perSource[0]).toEqual({
      source: "law-at-judikatur",
      pages: 50,
      chunks: 3000,
      embedded: 0,
      coveragePct: 0,
      avgLength: 2000,
    });
    expect(s.perSource[1].coveragePct).toBe(25);
    expect(s.perSource[1].avgLength).toBe(400);
  });

  it("degrades to zeros for text stats when the sample is empty, keeping exact counts", () => {
    const s = buildQualitySnapshot(inventory, []);
    expect(s.totalChunks).toBe(4000);
    expect(s.sampledChunks).toBe(0);
    expect(s.avgLength).toBe(0);
    expect(s.roleDistribution).toEqual([]);
    expect(s.lengthHistogram.every((b) => b.count === 0)).toBe(true);
    expect(s.perSource.every((r) => r.avgLength === 0)).toBe(true);
  });

  it("labels chunks without a role as '(leer)'", () => {
    const s = buildQualitySnapshot(inventory, [cell({ source_id: "law-at-normen", n: 4 })]);
    expect(s.roleDistribution).toEqual([{ role: "(leer)", count: 4000 }]);
  });
});

describe("computeAndStoreQuality", () => {
  it("samples 1 % of the law chunks and stores one JSON row", async () => {
    const seen: string[] = [];
    const pool = fakePool((sql) => {
      seen.push(sql);
      if (sql.includes("TABLESAMPLE"))
        return {
          rows: [cell({ source_id: "law-at-normen", chunk_role: "absatz", n: 10, avg_len: 300 })],
        };
      return { rows: [] };
    });
    const s = await computeAndStoreQuality(pool, inventory as never);
    expect(s.totalChunks).toBe(4000);
    const sample = seen.find((q) => q.includes("TABLESAMPLE SYSTEM (1)"));
    expect(sample).toContain("source_id LIKE 'law-%'");
    expect(sample).not.toMatch(/FROM pages p\s+LEFT JOIN content_chunks/);
    const insert = pool.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO corpus_quality_snapshot")
    );
    expect(insert).toBeDefined();
    expect(JSON.parse(insert![1][0] as string).totalChunks).toBe(4000);
  });
});

describe("readLatestQuality", () => {
  it("returns the newest row with an ISO time, or null before the first run", async () => {
    const empty = fakePool(() => ({ rows: [] }));
    expect(await readLatestQuality(empty)).toBeNull();
    const pool = fakePool(() => ({
      rows: [{ payload: { totalChunks: 7 }, measured_at: new Date("2026-09-24T08:10:19Z") }],
    }));
    const r = await readLatestQuality(pool);
    expect(r?.measured_at).toBe("2026-09-24T08:10:19.000Z");
    expect(r?.snapshot.totalChunks).toBe(7);
  });
});
