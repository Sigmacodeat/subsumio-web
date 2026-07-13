/**
 * Agentic Retrieval Loop — multi-round retrieval with completeness checking.
 *
 * Harvey pattern: instead of one-shot retrieval, evaluate whether the
 * retrieved context is sufficient for the legal question. If not,
 * refine the query and search again.
 *
 * Architecture:
 *   Round 1: Standard hybrid search with concept-map expansion
 *   → Completeness check (LLM or heuristic): "Is the specific § mentioned?"
 *   → If incomplete: Round 2 with refined query using missing terms
 *   → Merge + dedup results
 *
 * Integrated in gather.ts when legalMode is active.
 */

import type { BrainEngine } from "../engine.ts";
import type { SearchResult } from "../types.ts";
import { hybridSearch } from "../search/hybrid.ts";
import { expandLegalQuery } from "../think/legal-query-expand.ts";
import { expandConceptQuery, findConceptMappings, extractSectionNumbers } from "../legal/concept-map.ts";
import { chat as gatewayChat } from "../ai/gateway.ts";

export interface AgenticRetrievalOpts {
  question: string;
  jurisdiction?: string;
  sourceId?: string;
  sourceIds?: string[];
  limit?: number;
  /** Max rounds (default 2). Round 1 is always run. */
  maxRounds?: number;
  /** Enable LLM-based completeness check (default true for legal queries). */
  llmCompletenessCheck?: boolean;
  /** LLM model for completeness check (default: utility tier). */
  completenessModel?: string;
}

export interface AgenticRetrievalResult {
  results: SearchResult[];
  rounds: {
    round: number;
    query: string;
    resultCount: number;
    missingTerms?: string[];
  }[];
  totalRounds: number;
  refined: boolean;
}

/**
 * Heuristic completeness check — no LLM needed.
 * Checks if retrieved results contain §-numbers that match
 * the concept-map expectations for the query.
 */
function heuristicCompleteness(
  query: string,
  results: SearchResult[],
  jurisdiction?: string
): { complete: boolean; missing: string[] } {
  const expectedMappings = findConceptMappings(query, jurisdiction as "de" | "at" | undefined);
  if (expectedMappings.length === 0) return { complete: true, missing: [] };

  // Check if any result contains the expected §-number in its text
  const missing: string[] = [];
  for (const mapping of expectedMappings) {
    for (const section of mapping.sections) {
      const sectionStr = String(section);
      const found = results.some(r =>
        r.chunk_text?.includes(`§ ${sectionStr}`) ||
        r.chunk_text?.includes(`§${sectionStr}`) ||
        r.slug?.includes(`p-${sectionStr}`) ||
        r.slug?.includes(`art-${sectionStr}`) ||
        r.title?.includes(`§ ${sectionStr}`)
      );
      if (!found) {
        missing.push(`§ ${sectionStr} ${mapping.law}`);
      }
    }
  }

  return { complete: missing.length === 0, missing: missing.slice(0, 5) };
}

/**
 * LLM-based completeness check — asks a cheap LLM whether
 * the retrieved context is sufficient for the legal question.
 */
async function llmCompletenessCheck(
  question: string,
  results: SearchResult[],
  model?: string
): Promise<{ complete: boolean; missing: string[] }> {
  try {
    const snippets = results
      .slice(0, 10)
      .map((r, i) => `[${i}] ${r.title}: ${r.chunk_text?.slice(0, 200) ?? ""}`)
      .join("\n");

    const system = `Du bist ein juristischer Recherche-Assistent. Bewerte ob die gefundenen Textauszüge ausreichen um die rechtliche Frage zu beantworten.
Antworte als JSON: {"complete": true/false, "missing": ["was fehlt"]}`;

    const user = `Frage: ${question}

Gefundene Auszüge:
${snippets}

Reichen diese Auszüge aus? Was fehlt spezifisch?`;

    const result = await gatewayChat({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 200,
      ...(model ? { model } : {}),
    });

    const text = result.text?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { complete: true, missing: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      complete: !!parsed.complete,
      missing: Array.isArray(parsed.missing) ? parsed.missing.slice(0, 5) : [],
    };
  } catch {
    // Fail-open: assume complete
    return { complete: true, missing: [] };
  }
}

/**
 * Refine the query for round 2 based on missing terms.
 * Appends missing §-numbers and legal terms.
 */
function refineQuery(
  originalQuery: string,
  missing: string[],
  jurisdiction?: string
): string {
  const base = expandLegalQuery(originalQuery);
  const conceptExpanded = expandConceptQuery(base, jurisdiction as "de" | "at" | undefined);
  const missingTerms = missing.slice(0, 5).join(" ");
  return `${conceptExpanded} ${missingTerms}`;
}

/**
 * Agentic retrieval loop — multi-round search with completeness checking.
 *
 * Round 1: Standard hybrid search with concept-map expansion
 * If incomplete → Round 2: Refined search with missing terms
 * Results are merged and deduped.
 */
export async function agenticRetrieval(
  engine: BrainEngine,
  opts: AgenticRetrievalOpts
): Promise<AgenticRetrievalResult> {
  const maxRounds = opts.maxRounds ?? 2;
  const limit = opts.limit ?? 20;
  const rounds: AgenticRetrievalResult["rounds"] = [];

  // Round 1: Standard search
  const query1 = expandConceptQuery(
    expandLegalQuery(opts.question),
    opts.jurisdiction as "de" | "at" | undefined,
  );

  const results1 = await hybridSearch(engine, query1, {
    limit,
    expansion: false,
    sourceId: opts.sourceId,
    sourceIds: opts.sourceIds,
    jurisdiction: opts.jurisdiction,
  }).catch(() => [] as SearchResult[]);

  rounds.push({ round: 1, query: query1, resultCount: results1.length });

  if (results1.length === 0 || maxRounds < 2) {
    return { results: results1, rounds, totalRounds: 1, refined: false };
  }

  // Completeness check
  let missing: string[] = [];
  let useLLM = opts.llmCompletenessCheck !== false;

  if (useLLM) {
    const llmResult = await llmCompletenessCheck(
      opts.question,
      results1,
      opts.completenessModel,
    );
    missing = llmResult.missing;
    if (llmResult.complete && missing.length === 0) {
      return { results: results1, rounds, totalRounds: 1, refined: false };
    }
  }

  // Also run heuristic check (may catch things LLM missed)
  const heurResult = heuristicCompleteness(opts.question, results1, opts.jurisdiction);
  const allMissing = Array.from(new Set([...missing, ...heurResult.missing]));

  if (allMissing.length === 0) {
    return { results: results1, rounds, totalRounds: 1, refined: false };
  }

  // Round 2: Refined search
  const query2 = refineQuery(opts.question, allMissing, opts.jurisdiction);
  const results2 = await hybridSearch(engine, query2, {
    limit: Math.ceil(limit * 0.6), // smaller budget for round 2
    expansion: false,
    sourceId: opts.sourceId,
    sourceIds: opts.sourceIds,
    jurisdiction: opts.jurisdiction,
  }).catch(() => [] as SearchResult[]);

  rounds.push({
    round: 2,
    query: query2,
    resultCount: results2.length,
    missingTerms: allMissing,
  });

  // Merge + dedup by chunk_id
  const seen = new Set<number>();
  const merged: SearchResult[] = [];
  for (const r of [...results1, ...results2]) {
    if (r.chunk_id && !seen.has(r.chunk_id)) {
      seen.add(r.chunk_id);
      merged.push(r);
    }
  }

  // Sort by score descending
  merged.sort((a, b) => b.score - a.score);

  return {
    results: merged.slice(0, limit),
    rounds,
    totalRounds: 2,
    refined: true,
  };
}
