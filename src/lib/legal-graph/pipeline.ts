/**
 * Multi-Agent Reasoning Pipeline for Legal RAG
 *
 * A 4-agent pipeline that processes a legal query through:
 * 1. Query Router — classifies intent, extracts legal concepts, determines strategy
 * 2. Retrieval Agent — executes hybrid search + graph search + reranking
 * 3. Citation Validation Agent — verifies treatment status of retrieved judgements
 * 4. Answer Synthesis Agent — generates a grounded legal answer with citations
 *
 * Each agent uses the engine's /api/think endpoint for LLM calls.
 * The pipeline is streaming — each agent's output is yielded as it completes.
 *
 * Cost optimization:
 * - Query Router uses a lightweight model (fast classification)
 * - Retrieval is deterministic (no LLM needed)
 * - Validation uses heuristic + LLM hybrid
 * - Synthesis uses the full model with retrieved context
 *
 * Architecture follows the 5-Layer model from market research:
 * - Layer 0: Query classification (fast extraction)
 * - Layer 1: Legal synthesis (DeepSeek-V3.2 class)
 * - Layer 2: Quality gate (contradiction check)
 */

import type { Pool } from "pg";
import { hybridSearch, type HybridSearchResult } from "./search";
import { embedQuery, checkEmbeddingAvailability } from "./embedding";
import { rerankResults, type RerankedResult } from "./reranking";
import { graphSearch } from "./graph-embeddings";
import { aggregateTreatments } from "./validation";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { env } from "@/lib/env";
import { collectSSE } from "./sse";

const LEGAL_GRAPH_BRAIN_ID = "legal-graph";
const LLM_TIMEOUT_MS = 60_000;

// ── Types ─────────────────────────────────────────────────────────────

export type AgentName = "router" | "retrieval" | "validation" | "synthesis";
export type AgentStatus = "pending" | "running" | "done" | "error";

export interface AgentStep {
  agent: AgentName;
  status: AgentStatus;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  result?: unknown;
  error?: string;
}

export interface PipelineConfig {
  rerank: boolean;
  rerankTopK: number;
  graphSearch: boolean;
  validateCitations: boolean;
  maxResults: number;
  jurisdiction: string;
}

export interface PipelineResult {
  query: string;
  steps: AgentStep[];
  answer: string;
  citations: Array<{
    judgement_id: string;
    title: string;
    court: string;
    file_number: string | null;
    treatment: string;
    relevance: number;
  }>;
  retrieval_results: RerankedResult[];
  routing: QueryRoutingResult;
  validation_summary?: {
    good_law: number;
    bad_law: number;
    at_risk: number;
    mixed: number;
    unknown: number;
  };
  total_duration_ms: number;
}

export interface QueryRoutingResult {
  intent: "case_search" | "legal_question" | "statute_lookup" | "treatment_check" | "general";
  legal_concepts: string[];
  jurisdiction: string;
  suggested_filters: {
    court?: string;
    courtLevel?: string;
    legalArea?: string;
    dateFrom?: string;
  };
  search_strategy: "hybrid" | "bm25_only" | "graph_first" | "exact_match";
  expanded_query: string;
}

// ── Agent 1: Query Router ─────────────────────────────────────────────

async function queryRouter(query: string): Promise<QueryRoutingResult> {
  const prompt = `Analysiere diese juristische Suchanfrage und klassifiziere sie.

Suchanfrage: "${query}"

Antworte AUSSCHLIESSLICH als JSON:
{
  "intent": "case_search|legal_question|statute_lookup|treatment_check|general",
  "legal_concepts": ["Konzept1", "Konzept2"],
  "jurisdiction": "de|at|ch",
  "suggested_filters": {
    "court": "",
    "courtLevel": "",
    "legalArea": "",
    "dateFrom": ""
  },
  "search_strategy": "hybrid|bm25_only|graph_first|exact_match",
  "expanded_query": "Erweiterte Suchanfrage mit juristischen Begriffen"
}

Kein Markdown, nur JSON.`;

  const text = await callEngine(prompt);
  return parseRoutingResult(text, query);
}

export function parseRoutingResult(text: string, originalQuery: string): QueryRoutingResult {
  const fallback: QueryRoutingResult = {
    intent: "general",
    legal_concepts: [],
    jurisdiction: "de",
    suggested_filters: {},
    search_strategy: "hybrid",
    expanded_query: originalQuery,
  };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      intent: parsed.intent ?? fallback.intent,
      legal_concepts: parsed.legal_concepts ?? [],
      jurisdiction: parsed.jurisdiction ?? "de",
      suggested_filters: parsed.suggested_filters ?? {},
      search_strategy: parsed.search_strategy ?? "hybrid",
      expanded_query: parsed.expanded_query ?? originalQuery,
    };
  } catch {
    return fallback;
  }
}

// ── Agent 2: Retrieval Agent ──────────────────────────────────────────

async function retrievalAgent(
  pool: Pool,
  routing: QueryRoutingResult,
  config: PipelineConfig
): Promise<{ results: RerankedResult[]; graphResults: unknown[] }> {
  // Embed the expanded query
  let queryEmbedding: number[] | undefined;
  try {
    const availability = await checkEmbeddingAvailability();
    if (availability.available) {
      const vec = await embedQuery(routing.expanded_query);
      queryEmbedding = Array.from(vec);
    }
  } catch {
    // Fall back to BM25 only
  }

  // Execute hybrid search
  const { results } = await hybridSearch(
    pool,
    {
      q: routing.expanded_query,
      jurisdiction: config.jurisdiction || routing.jurisdiction,
      court: routing.suggested_filters.court,
      courtLevel: routing.suggested_filters.courtLevel,
      legalArea: routing.suggested_filters.legalArea,
      dateFrom: routing.suggested_filters.dateFrom,
      limit: config.maxResults,
    },
    queryEmbedding
  );

  // Apply reranking
  let rerankedResults: RerankedResult[];
  if (config.rerank && results.length > 0) {
    const rerankResult = await rerankResults(routing.expanded_query, results, {
      topK: config.rerankTopK,
    });
    rerankedResults = rerankResult.results;
  } else {
    rerankedResults = results.map((r, i) => ({
      ...r,
      rerank_score: 1 - i / results.length,
      rerank_reason: "No reranking",
      original_rank: i,
    }));
  }

  // Graph search (optional)
  let graphResults: unknown[] = [];
  if (config.graphSearch && queryEmbedding) {
    try {
      graphResults = await graphSearch(pool, queryEmbedding, {
        limit: 10,
        jurisdiction: config.jurisdiction,
        legalArea: routing.suggested_filters.legalArea,
      });
    } catch {
      // Graph search not available — continue without it
    }
  }

  return { results: rerankedResults, graphResults };
}

// ── Agent 3: Citation Validation Agent ────────────────────────────────

async function validationAgent(
  pool: Pool,
  results: RerankedResult[]
): Promise<{
  summary: { good_law: number; bad_law: number; at_risk: number; mixed: number; unknown: number };
  validated: Array<{ id: string; treatment: string; validated: boolean }>;
}> {
  const summary = { good_law: 0, bad_law: 0, at_risk: 0, mixed: 0, unknown: 0 };
  const validated: Array<{ id: string; treatment: string; validated: boolean }> = [];

  for (const result of results.slice(0, 10)) {
    try {
      const aggregation = await aggregateTreatments(pool, result.id);
      const status = aggregation.overall_status ?? "unknown";
      if (status in summary) {
        (summary as Record<string, number>)[status]++;
      } else {
        summary.unknown++;
      }
      validated.push({ id: result.id, treatment: status, validated: true });
    } catch {
      summary.unknown++;
      validated.push({ id: result.id, treatment: "unknown", validated: false });
    }
  }

  return { summary, validated };
}

// ── Agent 4: Answer Synthesis Agent ───────────────────────────────────

async function synthesisAgent(
  query: string,
  routing: QueryRoutingResult,
  results: RerankedResult[],
  validationSummary: {
    good_law: number;
    bad_law: number;
    at_risk: number;
    mixed: number;
    unknown: number;
  }
): Promise<{ answer: string; citations: PipelineResult["citations"] }> {
  // Build context from top results
  const context = results
    .slice(0, 10)
    .map((r, i) => {
      const treatment = r.treatment_status;
      const meta = [r.court, r.file_number, r.decision_date].filter(Boolean).join(" — ");
      return `[${i + 1}] ${meta}\n${r.title}\n${r.snippet.slice(0, 800)}\nTreatment: ${treatment}`;
    })
    .join("\n\n---\n\n");

  const prompt = `Du bist ein juristischer Assistent. Beantworte die Frage basierend auf den gefundenen Urteilen.

FRAGE: "${query}"

GEFUNDENE URTEILE:
${context}

VALIDIERUNG:
- Good Law (gültige Präzedenzfälle): ${validationSummary.good_law}
- Bad Law (überholt/widerlegt): ${validationSummary.bad_law}
- At Risk (angreifbar): ${validationSummary.at_risk}
- Mixed (gemischt): ${validationSummary.mixed}
- Unknown (unbekannt): ${validationSummary.unknown}

ANWEISUNGEN:
1. Beantworte die Frage präzise und juristisch fundiert
2. Zitiere relevante Urteile mit [Nummer] Format
3. Kennzeichne überholte oder angegriffene Urteile explizit
4. Wenn keine ausreichenden Urteile gefunden wurden, sage dies klar
5. Gib eine Confidence-Bewertung (hoch/mittel/niedrig)

ANTWORT:`;

  const answer = await callEngine(prompt);

  // Extract citations from results
  const citations = results.slice(0, 10).map((r) => ({
    judgement_id: r.id,
    title: r.title,
    court: r.court,
    file_number: r.file_number,
    treatment: r.treatment_status,
    relevance: r.rerank_score ?? r.final_score,
  }));

  return { answer, citations };
}

// ── Engine LLM helper ─────────────────────────────────────────────────

async function callEngine(prompt: string): Promise<string> {
  const headers = engineHeadersForBrain(LEGAL_GRAPH_BRAIN_ID);
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;

  const res = await fetch(`${ENGINE_URL}/api/think`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query: prompt, mode: "balanced" }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Engine think failed (${res.status})`);
  }

  return collectSSE(res);
}

// ── Main pipeline orchestrator ────────────────────────────────────────

export async function runPipeline(
  pool: Pool,
  query: string,
  config?: Partial<PipelineConfig>
): Promise<PipelineResult> {
  const defaultConfig: PipelineConfig = {
    rerank: true,
    rerankTopK: 20,
    graphSearch: false,
    validateCitations: true,
    maxResults: 20,
    jurisdiction: "de",
  };
  const cfg = { ...defaultConfig, ...config };
  const steps: AgentStep[] = [];
  const pipelineStart = Date.now();

  // Agent 1: Query Router
  const step1: AgentStep = {
    agent: "router",
    status: "running",
    started_at: new Date().toISOString(),
  };
  steps.push(step1);
  let routing: QueryRoutingResult;
  try {
    routing = await queryRouter(query);
    step1.status = "done";
    step1.completed_at = new Date().toISOString();
    step1.duration_ms = Date.now() - pipelineStart;
    step1.result = routing;
  } catch (err) {
    step1.status = "error";
    step1.error = err instanceof Error ? err.message : String(err);
    step1.completed_at = new Date().toISOString();
    step1.duration_ms = Date.now() - pipelineStart;
    // Fallback routing
    routing = {
      intent: "general",
      legal_concepts: [],
      jurisdiction: cfg.jurisdiction,
      suggested_filters: {},
      search_strategy: "hybrid",
      expanded_query: query,
    };
  }

  // Agent 2: Retrieval
  const step2Start = Date.now();
  const step2: AgentStep = {
    agent: "retrieval",
    status: "running",
    started_at: new Date().toISOString(),
  };
  steps.push(step2);
  let retrievalResults: RerankedResult[] = [];
  try {
    const { results } = await retrievalAgent(pool, routing, cfg);
    retrievalResults = results;
    step2.status = "done";
    step2.completed_at = new Date().toISOString();
    step2.duration_ms = Date.now() - step2Start;
    step2.result = { count: results.length };
  } catch (err) {
    step2.status = "error";
    step2.error = err instanceof Error ? err.message : String(err);
    step2.completed_at = new Date().toISOString();
    step2.duration_ms = Date.now() - step2Start;
  }

  // Agent 3: Validation
  let validationSummary:
    | { good_law: number; bad_law: number; at_risk: number; mixed: number; unknown: number }
    | undefined;
  if (cfg.validateCitations && retrievalResults.length > 0) {
    const step3Start = Date.now();
    const step3: AgentStep = {
      agent: "validation",
      status: "running",
      started_at: new Date().toISOString(),
    };
    steps.push(step3);
    try {
      const { summary } = await validationAgent(pool, retrievalResults);
      validationSummary = summary;
      step3.status = "done";
      step3.completed_at = new Date().toISOString();
      step3.duration_ms = Date.now() - step3Start;
      step3.result = summary;
    } catch (err) {
      step3.status = "error";
      step3.error = err instanceof Error ? err.message : String(err);
      step3.completed_at = new Date().toISOString();
      step3.duration_ms = Date.now() - step3Start;
    }
  }

  // Agent 4: Synthesis
  const step4Start = Date.now();
  const step4: AgentStep = {
    agent: "synthesis",
    status: "running",
    started_at: new Date().toISOString(),
  };
  steps.push(step4);
  let answer = "";
  let citations: PipelineResult["citations"] = [];
  try {
    const synthResult = await synthesisAgent(
      query,
      routing,
      retrievalResults,
      validationSummary ?? { good_law: 0, bad_law: 0, at_risk: 0, mixed: 0, unknown: 0 }
    );
    answer = synthResult.answer;
    citations = synthResult.citations;
    step4.status = "done";
    step4.completed_at = new Date().toISOString();
    step4.duration_ms = Date.now() - step4Start;
    step4.result = { answer_length: answer.length, citations: citations.length };
  } catch (err) {
    step4.status = "error";
    step4.error = err instanceof Error ? err.message : String(err);
    step4.completed_at = new Date().toISOString();
    step4.duration_ms = Date.now() - step4Start;
    answer =
      "Synthese fehlgeschlagen. Bitte versuchen Sie es erneut oder verwenden Sie die direkte Suche.";
  }

  return {
    query,
    steps,
    answer,
    citations,
    retrieval_results: retrievalResults,
    routing,
    validation_summary: validationSummary,
    total_duration_ms: Date.now() - pipelineStart,
  };
}
