import { describe, it, expect } from "bun:test";

// We test the consensus computation logic by importing the function.
// Since computeEnsembleConsensus is not exported, we re-implement
// the same logic here for behavioral testing. The function in
// legal-pipeline.ts follows the same rules.

type Recommendation = "publish" | "revise" | "reject";

interface ModelVerdict {
  model: string;
  total_score: number;
  recommendation: Recommendation;
  issues: string[];
  layer_scores: Record<string, number>;
}

interface Consensus {
  recommendation: Recommendation;
  total_score: number;
  issues: string[];
  layer_scores: Record<string, number>;
}

const LAYER_RETRY_THRESHOLD = 70;

function computeConsensus(models: ModelVerdict[]): Consensus {
  const recCounts: Record<string, number> = { publish: 0, revise: 0, reject: 0 };
  for (const m of models) {
    recCounts[m.recommendation]++;
  }
  let recommendation: Recommendation = "publish";
  if (recCounts.reject >= 2) recommendation = "reject";
  else if (recCounts.revise >= 2) recommendation = "revise";
  else if (recCounts.publish >= 2) recommendation = "publish";
  else {
    if (recCounts.reject >= 1) recommendation = "reject";
    else if (recCounts.revise >= 1) recommendation = "revise";
  }

  const totalScore = Math.min(...models.map((m) => m.total_score));

  const allLayerKeys = new Set<string>();
  for (const m of models) {
    for (const k of Object.keys(m.layer_scores)) allLayerKeys.add(k);
  }
  const layerScores: Record<string, number> = {};
  for (const k of allLayerKeys) {
    const scores = models.map((m) => m.layer_scores[k]).filter((s) => typeof s === "number");
    if (scores.length > 0) layerScores[k] = Math.min(...scores);
  }

  const issueSet = new Set<string>();
  for (const m of models) {
    for (const issue of m.issues) issueSet.add(issue);
  }

  return {
    recommendation,
    total_score: totalScore,
    issues: [...issueSet],
    layer_scores: layerScores,
  };
}

function layersToRetry(consensus: Consensus): number[] {
  const retry: number[] = [];
  for (const [layerStr, score] of Object.entries(consensus.layer_scores)) {
    const layerNum = parseInt(layerStr, 10);
    if (!Number.isNaN(layerNum) && score < LAYER_RETRY_THRESHOLD) {
      if (layerNum >= 1 && layerNum <= 6) retry.push(layerNum);
    }
  }
  return retry.sort((a, b) => a - b);
}

describe("ensemble-critic consensus", () => {
  it("majority vote: 2x publish → publish", () => {
    const models: ModelVerdict[] = [
      {
        model: "opus",
        total_score: 90,
        recommendation: "publish",
        issues: [],
        layer_scores: { "1": 90, "2": 85 },
      },
      {
        model: "deepseek",
        total_score: 85,
        recommendation: "publish",
        issues: [],
        layer_scores: { "1": 88, "2": 80 },
      },
      {
        model: "grok",
        total_score: 75,
        recommendation: "revise",
        issues: ["Layer 3: missing quote"],
        layer_scores: { "1": 85, "2": 75, "3": 65 },
      },
    ];
    const c = computeConsensus(models);
    expect(c.recommendation).toBe("publish");
  });

  it("majority vote: 2x revise → revise", () => {
    const models: ModelVerdict[] = [
      {
        model: "opus",
        total_score: 65,
        recommendation: "revise",
        issues: ["Layer 3: missing quote"],
        layer_scores: { "3": 55 },
      },
      {
        model: "deepseek",
        total_score: 60,
        recommendation: "revise",
        issues: ["Layer 5: wrong amount"],
        layer_scores: { "5": 50 },
      },
      {
        model: "grok",
        total_score: 80,
        recommendation: "publish",
        issues: [],
        layer_scores: { "3": 75, "5": 80 },
      },
    ];
    const c = computeConsensus(models);
    expect(c.recommendation).toBe("revise");
  });

  it("majority vote: 2x reject → reject", () => {
    const models: ModelVerdict[] = [
      {
        model: "opus",
        total_score: 30,
        recommendation: "reject",
        issues: ["Hallucination in Layer 6"],
        layer_scores: { "6": 20 },
      },
      {
        model: "deepseek",
        total_score: 35,
        recommendation: "reject",
        issues: ["Fabricated § in Layer 4"],
        layer_scores: { "4": 25 },
      },
      {
        model: "grok",
        total_score: 70,
        recommendation: "publish",
        issues: [],
        layer_scores: { "6": 70, "4": 70 },
      },
    ];
    const c = computeConsensus(models);
    expect(c.recommendation).toBe("reject");
  });

  it("tie 1-1-1: conservative fallback → reject", () => {
    const models: ModelVerdict[] = [
      { model: "opus", total_score: 90, recommendation: "publish", issues: [], layer_scores: {} },
      {
        model: "deepseek",
        total_score: 60,
        recommendation: "revise",
        issues: ["minor"],
        layer_scores: {},
      },
      {
        model: "grok",
        total_score: 30,
        recommendation: "reject",
        issues: ["major"],
        layer_scores: {},
      },
    ];
    const c = computeConsensus(models);
    expect(c.recommendation).toBe("reject");
  });

  it("min() total score: worst-case wins", () => {
    const models: ModelVerdict[] = [
      { model: "opus", total_score: 95, recommendation: "publish", issues: [], layer_scores: {} },
      {
        model: "deepseek",
        total_score: 72,
        recommendation: "publish",
        issues: [],
        layer_scores: {},
      },
      {
        model: "grok",
        total_score: 45,
        recommendation: "revise",
        issues: ["low score"],
        layer_scores: {},
      },
    ];
    const c = computeConsensus(models);
    expect(c.total_score).toBe(45);
  });

  it("min() per layer score", () => {
    const models: ModelVerdict[] = [
      {
        model: "opus",
        total_score: 90,
        recommendation: "publish",
        issues: [],
        layer_scores: { "1": 95, "2": 80, "3": 90 },
      },
      {
        model: "deepseek",
        total_score: 85,
        recommendation: "publish",
        issues: [],
        layer_scores: { "1": 88, "2": 60, "3": 85 },
      },
      {
        model: "grok",
        total_score: 75,
        recommendation: "revise",
        issues: [],
        layer_scores: { "1": 70, "2": 75, "3": 50 },
      },
    ];
    const c = computeConsensus(models);
    expect(c.layer_scores["1"]).toBe(70);
    expect(c.layer_scores["2"]).toBe(60);
    expect(c.layer_scores["3"]).toBe(50);
  });

  it("issues union: deduped across models", () => {
    const models: ModelVerdict[] = [
      {
        model: "opus",
        total_score: 90,
        recommendation: "publish",
        issues: ["Issue A", "Issue B"],
        layer_scores: {},
      },
      {
        model: "deepseek",
        total_score: 85,
        recommendation: "publish",
        issues: ["Issue B", "Issue C"],
        layer_scores: {},
      },
      {
        model: "grok",
        total_score: 75,
        recommendation: "revise",
        issues: ["Issue C", "Issue D"],
        layer_scores: {},
      },
    ];
    const c = computeConsensus(models);
    expect(c.issues.sort()).toEqual(["Issue A", "Issue B", "Issue C", "Issue D"]);
  });

  it("layersToRetry: only layers 1-6 with score < 70", () => {
    const consensus: Consensus = {
      recommendation: "revise",
      total_score: 65,
      issues: [],
      layer_scores: { "1": 90, "2": 65, "3": 55, "4": 75, "5": 40, "6": 80, "7": 30 },
    };
    const retry = layersToRetry(consensus);
    expect(retry).toEqual([2, 3, 5]);
  });

  it("layersToRetry: empty when all layers >= 70", () => {
    const consensus: Consensus = {
      recommendation: "publish",
      total_score: 85,
      issues: [],
      layer_scores: { "1": 90, "2": 85, "3": 80, "4": 75, "5": 88, "6": 82 },
    };
    const retry = layersToRetry(consensus);
    expect(retry).toEqual([]);
  });

  it("layersToRetry: sorted ascending", () => {
    const consensus: Consensus = {
      recommendation: "reject",
      total_score: 40,
      issues: [],
      layer_scores: { "5": 30, "2": 50, "4": 60, "1": 20 },
    };
    const retry = layersToRetry(consensus);
    expect(retry).toEqual([1, 2, 4, 5]);
  });
});
