import { describe, it, expect } from "bun:test";
import {
  pagesFromChunks,
  pairedBootstrap,
  rrfFuse,
  scoreRanking,
  topKDot,
  truncateAndNormalize,
} from "../src/eval/embedding-bakeoff/metrics.ts";

describe("embedding bake-off metrics", () => {
  it("collapses chunks to pages in first-seen order", () => {
    const pageOf = new Map([
      [1, 10],
      [2, 10],
      [3, 20],
      [4, 30],
    ]);
    expect(pagesFromChunks([2, 3, 1, 4, 99], pageOf)).toEqual([10, 20, 30]);
  });

  it("scores a hit at rank 2", () => {
    const m = scoreRanking([5, 7, 9], new Set([7]));
    expect(m.recall1).toBe(0);
    expect(m.recall5).toBe(1);
    expect(m.mrr10).toBe(0.5);
    expect(m.ndcg10).toBeCloseTo(1 / Math.log2(3), 6);
  });

  it("scores a miss as zero", () => {
    const m = scoreRanking([1, 2, 3], new Set([42]));
    expect(m).toEqual({ recall1: 0, recall5: 0, recall10: 0, mrr10: 0, ndcg10: 0 });
  });

  it("RRF puts an item ranked high in both lists first", () => {
    expect(rrfFuse([[1, 2, 3], [3, 2, 1], [2]])[0]).toBe(2);
  });

  it("truncates and re-normalizes", () => {
    const v = truncateAndNormalize([3, 4, 100], 2);
    expect(v.length).toBe(2);
    expect(v[0]).toBeCloseTo(0.6, 6);
    expect(v[1]).toBeCloseTo(0.8, 6);
  });

  it("finds exact nearest neighbours by dot product", () => {
    const docs = new Float32Array([1, 0, 0, 1, 0.7071, 0.7071]);
    expect(topKDot(new Float32Array([0, 1]), docs, 2, 2)).toEqual([1, 2]);
  });

  it("bootstrap interval excludes zero for a consistent gain", () => {
    const a = Array.from({ length: 200 }, (_, i) => (i % 2 ? 0.9 : 0.8));
    const b = a.map((x) => x - 0.1);
    const r = pairedBootstrap(a, b);
    expect(r.diff).toBeCloseTo(0.1, 6);
    expect(r.lo).toBeGreaterThan(0);
  });

  it("bootstrap interval includes zero for noise", () => {
    const a = Array.from({ length: 50 }, (_, i) => (i % 2 ? 1 : 0));
    const b = Array.from({ length: 50 }, (_, i) => (i % 2 ? 0 : 1));
    const r = pairedBootstrap(a, b);
    expect(r.lo).toBeLessThan(0);
    expect(r.hi).toBeGreaterThan(0);
  });
});
