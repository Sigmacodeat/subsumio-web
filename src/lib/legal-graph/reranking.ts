/**
 * Cross-Encoder Reranking for Legal Graph Search
 *
 * After hybrid search retrieves Top-K candidates (BM25 + Vector + RRF),
 * a cross-encoder model re-scores each (query, document) pair with a
 * fine-grained relevance score. This is the standard two-stage retrieval
 * architecture: fast retrieval → precise reranking.
 *
 * Implementation:
 * - Uses the engine's /api/think endpoint with a scoring prompt
 * - The LLM evaluates query-document relevance on a 0-10 scale
 * - Results are sorted by the new cross-encoder score
 * - Fallback: if LLM is unavailable, returns original order with warning
 *
 * Cost optimization:
 * - Only reranks Top-K (default 20) — not the full result set
 * - Uses a lightweight model (GPT-4o-mini or DeepSeek-V3.2) via engine
 * - Batch scoring: all (query, doc) pairs in one LLM call with structured output
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { env } from "@/lib/env";
import type { HybridSearchResult } from "./search";
import { collectSSE } from "./sse";

const LEGAL_GRAPH_BRAIN_ID = "legal-graph";
const RERANK_TOP_K = 20;
const LLM_TIMEOUT_MS = 30_000;

export interface RerankedResult extends HybridSearchResult {
  rerank_score: number;
  rerank_reason: string;
  original_rank: number;
}

/**
 * Rerank hybrid search results using a cross-encoder LLM call.
 *
 * The LLM receives the query and all candidate snippets, then returns
 * a JSON array of {id, score, reason} for each candidate.
 */
export async function rerankResults(
  query: string,
  results: HybridSearchResult[],
  opts?: { topK?: number }
): Promise<{ results: RerankedResult[]; reranked: boolean; model: string }> {
  const topK = opts?.topK ?? RERANK_TOP_K;
  const candidates = results.slice(0, topK);

  if (candidates.length === 0) {
    return { results: [], reranked: false, model: "" };
  }

  if (candidates.length === 1) {
    return {
      results: [
        { ...candidates[0], rerank_score: 1.0, rerank_reason: "Single result", original_rank: 0 },
      ],
      reranked: false,
      model: "",
    };
  }

  try {
    const scores = await scoreWithLLM(query, candidates);
    return scores;
  } catch (err) {
    console.error("[legal-graph] Reranking failed, returning original order:", err);
    return {
      results: candidates.map((r, i) => ({
        ...r,
        rerank_score: 1 - i / candidates.length,
        rerank_reason: "Reranking unavailable — original order preserved",
        original_rank: i,
      })),
      reranked: false,
      model: "",
    };
  }
}

async function scoreWithLLM(
  query: string,
  candidates: HybridSearchResult[]
): Promise<{ results: RerankedResult[]; reranked: true; model: string }> {
  const headers = engineHeadersForBrain(LEGAL_GRAPH_BRAIN_ID);
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;

  // Build the scoring prompt
  const candidateTexts = candidates
    .map((c, i) => {
      const meta = [c.court, c.file_number, c.decision_date, c.legal_area]
        .filter(Boolean)
        .join(" — ");
      return `[${i}] ${meta}\n${c.title}\n${c.snippet.slice(0, 500)}`;
    })
    .join("\n\n---\n\n");

  const prompt = `Du bist ein juristischer Relevance-Judge. Bewerte die Relevanz jedes Urteils für die Suchanfrage auf einer Skala von 0 bis 10.

Suchanfrage: "${query}"

Kandidaten:
${candidateTexts}

Bewerte jedes Urteil basierend auf:
1. Thematische Übereinstimmung mit der Suchanfrage (0-4 Punkte)
2. Juristische Relevanz — geht es um dieselbe Rechtsfrage? (0-3 Punkte)
3. Autorität des Gerichts und Aktualität (0-2 Punkte)
4. Präzision der Übereinstimmung — keine falschen Treffer (0-1 Punkt)

Antworte AUSSCHLIESSLICH als JSON-Array:
[{"index": 0, "score": 8.5, "reason": "Kurze Begründung"}, ...]

Kein Markdown, keine Erklärungen, nur das JSON-Array.`;

  const res = await fetch(`${ENGINE_URL}/api/think`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      query: prompt,
      mode: "balanced",
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Engine think failed (${res.status})`);
  }

  // Collect SSE response
  const text = await collectSSE(res);
  const scores = parseScores(text, candidates.length);

  const results: RerankedResult[] = candidates.map((c, i) => {
    const score = scores.get(i);
    return {
      ...c,
      rerank_score: score?.score ?? 0,
      rerank_reason: score?.reason ?? "No score",
      original_rank: i,
    };
  });

  // Sort by rerank score descending
  results.sort((a, b) => b.rerank_score - a.rerank_score);

  return { results, reranked: true, model: "engine-llm" };
}

export function parseScores(
  text: string,
  count: number
): Map<number, { score: number; reason: string }> {
  const scores = new Map<number, { score: number; reason: string }>();

  // Try to extract JSON array from the response
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) {
    // Fallback: try to parse line by line
    return scores;
  }

  try {
    const arr = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      score: number;
      reason: string;
    }>;
    for (const item of arr) {
      if (typeof item.index === "number" && typeof item.score === "number") {
        scores.set(item.index, {
          score: Math.max(0, Math.min(10, item.score)),
          reason: item.reason ?? "",
        });
      }
    }
  } catch {
    // JSON parse failed — return empty scores
  }

  return scores;
}

/**
 * Heuristic reranking fallback — no LLM required.
 * Boosts results with high citation counts and recent dates.
 */
export function heuristicRerank(
  results: HybridSearchResult[],
  opts?: { topK?: number }
): RerankedResult[] {
  const topK = opts?.topK ?? RERANK_TOP_K;
  const candidates = results.slice(0, topK);

  const now = Date.now();
  const scored = candidates.map((r, i) => {
    let score = 1 - i / candidates.length; // Base: original rank

    // Citation boost (log-scaled)
    if (r.citation_count > 0) {
      score += Math.log(1 + r.citation_count) * 0.1;
    }

    // Recency boost (newer = better, 5-year half-life)
    if (r.decision_date) {
      const yearsAgo = (now - new Date(r.decision_date).getTime()) / (365.25 * 24 * 3600 * 1000);
      score += Math.exp(-0.1386 * yearsAgo) * 0.15;
    }

    // Treatment status boost
    if (r.treatment_status === "good_law") score += 0.1;
    if (r.treatment_status === "bad_law") score -= 0.15;
    if (r.treatment_status === "at_risk") score -= 0.05;

    return {
      ...r,
      rerank_score: Math.max(0, score),
      rerank_reason: "Heuristic: rank + citation + recency + treatment",
      original_rank: i,
    };
  });

  scored.sort((a, b) => b.rerank_score - a.rerank_score);
  return scored;
}
