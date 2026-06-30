import { describe, test, expect } from "vitest";
import { heuristicRerank, parseScores } from "./reranking";
import type { HybridSearchResult } from "./search";

function makeResult(overrides: Partial<HybridSearchResult> = {}): HybridSearchResult {
  return {
    id: "test-1",
    title: "Test Urteil",
    court: "BGH",
    court_level: "supreme",
    decision_date: "2024-01-15",
    decision_type: "Urteil",
    legal_area: "Zivilrecht",
    file_number: "I ZR 1/24",
    ecli: null,
    citation_count: 5,
    treatment_status: "good_law",
    snippet: "Dies ist ein Test-Snippet für das Urteil.",
    bm25_score: 0.5,
    vector_score: 0.7,
    citation_boost: 0.3,
    final_score: 0.8,
    source: "hybrid",
    ...overrides,
  };
}

describe("heuristicRerank", () => {
  test("preserves order for single result", () => {
    const results = [makeResult()];
    const reranked = heuristicRerank(results);
    expect(reranked).toHaveLength(1);
    expect(reranked[0].original_rank).toBe(0);
    expect(reranked[0].rerank_reason).toContain("Heuristic");
  });

  test("boosts good_law over bad_law with same rank position", () => {
    // Both at same original rank position (0) — test the boost in isolation
    const goodLaw = makeResult({ id: "good", treatment_status: "good_law" });
    const badLaw = makeResult({ id: "bad", treatment_status: "bad_law" });
    const goodReranked = heuristicRerank([goodLaw]);
    const badReranked = heuristicRerank([badLaw]);
    const goodScore = goodReranked[0].rerank_score;
    const badScore = badReranked[0].rerank_score;
    expect(goodScore).toBeGreaterThan(badScore);
  });

  test("boosts results with more citations", () => {
    const highCitations = makeResult({ id: "high", citation_count: 50 });
    const lowCitations = makeResult({ id: "low", citation_count: 0 });
    const highReranked = heuristicRerank([highCitations]);
    const lowReranked = heuristicRerank([lowCitations]);
    const highScore = highReranked[0].rerank_score;
    const lowScore = lowReranked[0].rerank_score;
    expect(highScore).toBeGreaterThan(lowScore);
  });

  test("respects topK limit", () => {
    const results = Array.from({ length: 30 }, (_, i) => makeResult({ id: `test-${i}` }));
    const reranked = heuristicRerank(results, { topK: 10 });
    expect(reranked).toHaveLength(10);
  });

  test("newer decisions get higher recency boost", () => {
    // Test in isolation — each as sole result
    const recent = makeResult({ id: "recent", decision_date: "2025-01-01" });
    const old = makeResult({ id: "old", decision_date: "2010-01-01" });
    const recentReranked = heuristicRerank([recent]);
    const oldReranked = heuristicRerank([old]);
    const recentScore = recentReranked[0].rerank_score;
    const oldScore = oldReranked[0].rerank_score;
    expect(recentScore).toBeGreaterThan(oldScore);
  });
});

describe("parseScores", () => {
  test("parses valid JSON array", () => {
    const text =
      'Some text [{"index": 0, "score": 8.5, "reason": "relevant"}, {"index": 1, "score": 3.0, "reason": "less relevant"}] more text';
    const scores = parseScores(text, 2);
    expect(scores.get(0)?.score).toBe(8.5);
    expect(scores.get(0)?.reason).toBe("relevant");
    expect(scores.get(1)?.score).toBe(3.0);
  });

  test("clamps scores to 0-10 range", () => {
    const text =
      '[{"index": 0, "score": 15, "reason": "too high"}, {"index": 1, "score": -5, "reason": "too low"}]';
    const scores = parseScores(text, 2);
    expect(scores.get(0)?.score).toBe(10);
    expect(scores.get(1)?.score).toBe(0);
  });

  test("returns empty map for invalid JSON", () => {
    const text = "No JSON here at all";
    const scores = parseScores(text, 2);
    expect(scores.size).toBe(0);
  });

  test("handles missing reason field", () => {
    const text = '[{"index": 0, "score": 7}]';
    const scores = parseScores(text, 1);
    expect(scores.get(0)?.score).toBe(7);
    expect(scores.get(0)?.reason).toBe("");
  });
});
