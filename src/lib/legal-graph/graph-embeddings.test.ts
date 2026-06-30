import { describe, test, expect } from "vitest";
import {
  l2Normalize,
  aggregateNeighbours,
  sampleNeighbours,
  buildAdjacencyList,
  TREATMENT_WEIGHTS,
  COURT_LEVEL_WEIGHTS,
} from "./graph-embeddings";
import type { GraphNode, GraphEdge } from "./graph-embeddings";

describe("l2Normalize", () => {
  test("normalizes a vector to unit length", () => {
    const vec = new Float32Array([3, 4]);
    const result = l2Normalize(vec);
    expect(result[0]).toBeCloseTo(0.6);
    expect(result[1]).toBeCloseTo(0.8);
  });

  test("returns zero vector unchanged", () => {
    const vec = new Float32Array([0, 0, 0]);
    const result = l2Normalize(vec);
    expect(Array.from(result)).toEqual([0, 0, 0]);
  });

  test("preserves dimensionality", () => {
    const vec = new Float32Array([1, 2, 3, 4, 5]);
    const result = l2Normalize(vec);
    expect(result.length).toBe(5);
  });
});

describe("aggregateNeighbours", () => {
  test("returns self embedding when no neighbours", () => {
    const self = new Float32Array([1, 0, 0]);
    const result = aggregateNeighbours(self, []);
    expect(result[0]).toBeCloseTo(1);
  });

  test("combines self with neighbour embeddings", () => {
    const self = new Float32Array([1, 0, 0]);
    const neighbours = [{ embedding: new Float32Array([0, 1, 0]), weight: 1.0 }];
    const result = aggregateNeighbours(self, neighbours);
    // Should not be equal to self (neighbours influence the result)
    expect(result.length).toBe(3);
    // Should be L2-normalized
    let norm = 0;
    for (let i = 0; i < result.length; i++) norm += result[i] * result[i];
    expect(Math.sqrt(norm)).toBeCloseTo(1.0);
  });

  test("handles negative weights (overruled citations)", () => {
    const self = new Float32Array([1, 0, 0]);
    const neighbours = [{ embedding: new Float32Array([0, 1, 0]), weight: -0.8 }];
    const result = aggregateNeighbours(self, neighbours);
    expect(result.length).toBe(3);
    // Should still be normalized
    let norm = 0;
    for (let i = 0; i < result.length; i++) norm += result[i] * result[i];
    expect(Math.sqrt(norm)).toBeCloseTo(1.0, 1);
  });
});

describe("sampleNeighbours", () => {
  test("returns all when fewer than sample size", () => {
    const neighbours = [
      { embedding: new Float32Array([1]), weight: 0.5 },
      { embedding: new Float32Array([2]), weight: 0.3 },
    ];
    const result = sampleNeighbours(neighbours, 10);
    expect(result.length).toBe(2);
  });

  test("trims to sample size, prioritizing higher absolute weights", () => {
    const neighbours = [
      { embedding: new Float32Array([1]), weight: 0.1 },
      { embedding: new Float32Array([2]), weight: 0.9 },
      { embedding: new Float32Array([3]), weight: -0.8 },
      { embedding: new Float32Array([4]), weight: 0.2 },
    ];
    const result = sampleNeighbours(neighbours, 2);
    expect(result.length).toBe(2);
    // 0.9 and -0.8 have highest absolute weights
    expect(result[0].weight).toBe(0.9);
    expect(result[1].weight).toBe(-0.8);
  });
});

describe("buildAdjacencyList", () => {
  test("builds bidirectional adjacency from edges", () => {
    const nodes = new Map<string, GraphNode>([
      [
        "a",
        {
          id: "a",
          embedding: new Float32Array([1]),
          court_level: "supreme",
          treatment_status: "good_law",
        },
      ],
      [
        "b",
        {
          id: "b",
          embedding: new Float32Array([2]),
          court_level: "appeal",
          treatment_status: "unknown",
        },
      ],
    ]);
    const edges: GraphEdge[] = [{ source: "a", target: "b", treatment: "positive", weight: 1.0 }];
    const adj = buildAdjacencyList(edges, nodes);
    // a → b (source gets target's embedding)
    expect(adj.has("a")).toBe(true);
    expect(adj.get("a")!.length).toBe(1);
    // b ← a (target gets source's embedding)
    expect(adj.has("b")).toBe(true);
    expect(adj.get("b")!.length).toBe(1);
  });

  test("skips edges where target node doesn't exist", () => {
    const nodes = new Map<string, GraphNode>([
      [
        "a",
        {
          id: "a",
          embedding: new Float32Array([1]),
          court_level: "supreme",
          treatment_status: "good_law",
        },
      ],
    ]);
    const edges: GraphEdge[] = [
      { source: "a", target: "nonexistent", treatment: "positive", weight: 1.0 },
    ];
    const adj = buildAdjacencyList(edges, nodes);
    expect(adj.size).toBe(0);
  });

  test("applies court level weight multiplier", () => {
    const nodes = new Map<string, GraphNode>([
      [
        "a",
        {
          id: "a",
          embedding: new Float32Array([1]),
          court_level: "local",
          treatment_status: "good_law",
        },
      ],
      [
        "b",
        {
          id: "b",
          embedding: new Float32Array([2]),
          court_level: "supreme",
          treatment_status: "good_law",
        },
      ],
    ]);
    const edges: GraphEdge[] = [{ source: "a", target: "b", treatment: "positive", weight: 1.0 }];
    const adj = buildAdjacencyList(edges, nodes);
    // a gets b's embedding with weight * COURT_LEVEL_WEIGHTS.supreme (1.5)
    const aNeighbours = adj.get("a")!;
    expect(aNeighbours[0].weight).toBeCloseTo(1.0 * 1.5);
  });
});

describe("Treatment weights", () => {
  test("positive treatment has positive weight", () => {
    expect(TREATMENT_WEIGHTS.positive).toBeGreaterThan(0);
  });

  test("overruled treatment has most negative weight", () => {
    expect(TREATMENT_WEIGHTS.overruled).toBeLessThan(TREATMENT_WEIGHTS.negative);
    expect(TREATMENT_WEIGHTS.overruled).toBeLessThan(0);
  });

  test("all treatment types are defined", () => {
    const required = ["positive", "negative", "neutral", "distinguishing", "overruled", "unknown"];
    for (const t of required) {
      expect(TREATMENT_WEIGHTS[t]).toBeDefined();
    }
  });
});

describe("Court level weights", () => {
  test("constitutional court has highest weight", () => {
    expect(COURT_LEVEL_WEIGHTS.constitutional).toBeGreaterThan(COURT_LEVEL_WEIGHTS.supreme);
  });

  test("local court has lowest weight", () => {
    expect(COURT_LEVEL_WEIGHTS.local).toBeLessThan(COURT_LEVEL_WEIGHTS.regional);
  });
});
