import { describe, expect, test } from "vitest";
import { comboToParams, generateParamCombos, recommendRun, scoreRun } from "./rag-optimizer.ts";
import type { OptimizationRun } from "./rag-optimizer.ts";

describe("rag-optimizer param generation", () => {
  test("generateParamCombos produces all combinations", () => {
    const combos = Array.from(
      generateParamCombos({
        "hnsw.ef_search": [64, 128],
        "llmRerank.enabled": [false, true],
      })
    );
    expect(combos).toHaveLength(4);
    expect(combos).toEqual(
      expect.arrayContaining([
        { "hnsw.ef_search": 64, "llmRerank.enabled": false },
        { "hnsw.ef_search": 64, "llmRerank.enabled": true },
        { "hnsw.ef_search": 128, "llmRerank.enabled": false },
        { "hnsw.ef_search": 128, "llmRerank.enabled": true },
      ])
    );
  });

  test("comboToParams merges base with combo", () => {
    const combo = { "hnsw.ef_search": 256, "llmRerank.enabled": true, "llmRerank.topNIn": 40 };
    const params = comboToParams(combo, { sourceIds: ["law-at"], topK: 5 });
    expect(params).toEqual({
      hnswEfSearch: 256,
      llmRerankEnabled: true,
      llmRerankTopNIn: 40,
      llmRerankModel: undefined,
      sourceIds: ["law-at"],
      fixturePath: undefined,
      jurisdiction: undefined,
      topK: 5,
    });
  });
});

describe("rag-optimizer scoring", () => {
  const baseParams = { hnswEfSearch: 64, llmRerankEnabled: false };

  function makeRun(id: number, hit5: number, mrr: number, latency: number): OptimizationRun {
    return {
      id,
      name: `run-${id}`,
      run_type: "sweep",
      status: "completed",
      params: baseParams,
      baseline_id: 1,
      results: {
        schema_version: 1,
        benchmark: "at-legal-retrieval",
        total: 60,
        top_k: 8,
        areas: [],
        aggregate: { hit_at_1: 0.5, hit_at_3: hit5, hit_at_5: hit5, hit_at_8: 1, mrr },
        law_aggregate: { hit_at_1: 0.5, hit_at_3: hit5, hit_at_5: hit5, hit_at_8: 1 },
        questions: [],
        latency_p95_ms: latency,
      } as any,
      cost_estimate_usd: 0.01,
      latency_p95_ms: latency,
      applied_at: null,
      created_by: "test",
      created_at: new Date().toISOString(),
    };
  }

  test("recommendRun picks the highest Hit@5 run", () => {
    const runs = [
      makeRun(1, 0.6, 0.5, 1000),
      makeRun(2, 0.9, 0.5, 1000),
      makeRun(3, 0.7, 0.5, 1000),
    ];
    const best = recommendRun(runs);
    expect(best?.id).toBe(2);
  });

  test("scoreRun prefers recall over latency when gain is large", () => {
    const lowLatency = makeRun(1, 0.6, 0.5, 1000);
    const highRecall = makeRun(2, 0.9, 0.8, 5000);
    expect(scoreRun(highRecall)).toBeGreaterThan(scoreRun(lowLatency));
  });
});
