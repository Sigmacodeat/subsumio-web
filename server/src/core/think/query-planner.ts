/**
 * Multi-Source Query Router — LLM-based query planning for legal retrieval.
 *
 * Harvey pattern: instead of sending one query to all sources, an LLM plans
 * the retrieval strategy by:
 *   1. Classifying the query intent (statute lookup, case analysis, etc.)
 *   2. Decomposing complex queries into targeted sub-queries
 *   3. Routing each sub-query to the appropriate source type
 *
 * Architecture:
 *   User Question
 *       ↓
 *   LLM Query Planner (DeepSeek, fast, JSON, ~0.3s)
 *       → intent: statute_lookup | case_analysis | internal_doc_search | mixed
 *       → sub_queries: [{ query, source_type, jurisdiction }]
 *       ↓
 *   For each sub_query → hybridSearch with scoped filters
 *       ↓
 *   Merge + dedup by chunk_id
 *       ↓
 *   Existing pipeline (rerank, agentic retrieval, etc.)
 *
 * Integrated in gather.ts when legalMode is active.
 * Fail-open: if the planner fails, falls back to the single-query path.
 */

import type { BrainEngine } from "../engine.ts";
import type { SearchResult } from "../types.ts";
import { hybridSearch } from "../search/hybrid.ts";
import { chat as gatewayChat } from "../ai/gateway.ts";
import { expandLegalQuery } from "./legal-query-expand.ts";
import { expandConceptQuery } from "../legal/concept-map.ts";
import { LEGAL_SOURCE_BY_JURISDICTION } from "../legal/jurisdiction.ts";

export type QueryIntent =
  | "statute_lookup"
  | "case_analysis"
  | "internal_doc_search"
  | "mixed";

export interface SubQuery {
  /** The refined search query for this sub-query. */
  query: string;
  /** Which source type to search. */
  source_type: "statutes" | "internal" | "all";
  /** Optional jurisdiction override (e.g. "de", "at"). */
  jurisdiction?: string;
}

export interface QueryPlan {
  intent: QueryIntent;
  sub_queries: SubQuery[];
  /** Whether the planner successfully decomposed the query. */
  decomposed: boolean;
}

export interface QueryPlannerOpts {
  question: string;
  /** Attorney's jurisdiction ("AT", "DE", "CH", "EU"). */
  jurisdiction?: string;
  /** Caller's source scope. */
  sourceId?: string;
  sourceIds?: string[];
  /** LLM model for planning (default: utility tier — cheap + fast). */
  model?: string;
  /** Total result limit across all sub-queries. */
  limit?: number;
}

export interface QueryPlannerResult {
  plan: QueryPlan;
  results: SearchResult[];
}

/**
 * LLM-based query planning. Sends the question to a fast LLM and asks it to
 * classify the intent and decompose into sub-queries with source routing.
 *
 * Fail-open: returns a single-query plan on any error.
 */
export async function planQuery(
  opts: QueryPlannerOpts
): Promise<QueryPlan> {
  const jurisdiction = opts.jurisdiction ?? "unbekannt";

  try {
    const system = `Du bist ein juristischer Query-Planer. Analysiere die rechtliche Frage und erstelle einen Retrieval-Plan.

Klassifiziere die Intention:
- "statute_lookup": Frage nach konkreten Gesetzesnormen, §-Nummern, Definitionen
- "case_analysis": Sachverhaltsanalyse, Subsumtion, Fallbezogene Frage
- "internal_doc_search": Suche in internen Dokumenten (Verträge, Schriftsätze, Mandantendaten)
- "mixed": Kombination aus mehreren Quellen

Erstelle Sub-Queries mit source_type:
- "statutes": Suche in Gesetzestexten (law-de, law-at, law-ch, law-eu)
- "internal": Suche in internen Dokumenten (Mandantensachen, Verträge)
- "all": Suche in allen Quellen

Antworte ALS JSON:
{"intent": "...", "sub_queries": [{"query": "...", "source_type": "...", "jurisdiction": "..."}]}

Regeln:
- Maximal 3 Sub-Queries
- Jede Sub-Query muss spezifisch und zielgerichtet sein
- Bei reinen §-Lookups: 1 Sub-Query mit source_type "statutes"
- Bei Sachverhaltsanalyse: 1-2 Sub-Queries (statutes + internal falls vorhanden)
- Bei gemischten Fragen: bis zu 3 Sub-Queries
- Jurisdiction nur setzen wenn aus der Frage erkennbar`;

    const user = `Frage: ${opts.question}
Jurisdiktion des Anwalts: ${jurisdiction}`;

    const result = await gatewayChat({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 400,
      ...(opts.model ? { model: opts.model } : {}),
    });

    const text = result.text?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackPlan(opts);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const intent = validateIntent(parsed.intent);
    const subQueries = validateSubQueries(parsed.sub_queries, opts.question, opts.jurisdiction);

    if (subQueries.length === 0) {
      return fallbackPlan(opts);
    }

    return {
      intent,
      sub_queries: subQueries,
      decomposed: subQueries.length > 1,
    };
  } catch {
    return fallbackPlan(opts);
  }
}

/**
 * Execute a query plan: run hybridSearch for each sub-query with appropriate
 * source scoping, then merge + dedup by chunk_id.
 */
export async function executeQueryPlan(
  engine: BrainEngine,
  plan: QueryPlan,
  opts: QueryPlannerOpts
): Promise<SearchResult[]> {
  const limit = opts.limit ?? 25;
  const perSubQuery = Math.ceil(limit / plan.sub_queries.length);

  const allResults: SearchResult[] = [];
  const seen = new Set<number>();

  for (const sq of plan.sub_queries) {
    // Expand the sub-query with legal synonyms + concept-map §-hints
    const expanded = expandConceptQuery(
      expandLegalQuery(sq.query),
      (sq.jurisdiction ?? opts.jurisdiction) as "de" | "at" | undefined,
    );

    // Determine source scoping based on source_type
    const sourceOpts = resolveSourceScope(sq.source_type, sq.jurisdiction ?? opts.jurisdiction, opts);

    try {
      const results = await hybridSearch(engine, expanded, {
        limit: perSubQuery,
        expansion: false,
        jurisdiction: sq.jurisdiction ?? opts.jurisdiction,
        ...sourceOpts,
      });

      for (const r of results) {
        if (r.chunk_id && !seen.has(r.chunk_id)) {
          seen.add(r.chunk_id);
          allResults.push(r);
        }
      }
    } catch {
      // Fail-open: skip this sub-query
    }
  }

  // Sort by score descending
  allResults.sort((a, b) => b.score - a.score);
  return allResults.slice(0, limit);
}

/**
 * Full pipeline: plan + execute.
 */
export async function planAndExecute(
  engine: BrainEngine,
  opts: QueryPlannerOpts
): Promise<QueryPlannerResult> {
  const plan = await planQuery(opts);
  const results = await executeQueryPlan(engine, plan, opts);
  return { plan, results };
}

// ── Helpers ──

export function fallbackPlan(opts: QueryPlannerOpts): QueryPlan {
  return {
    intent: "mixed",
    sub_queries: [
      {
        query: opts.question,
        source_type: "all",
        ...(opts.jurisdiction ? { jurisdiction: opts.jurisdiction } : {}),
      },
    ],
    decomposed: false,
  };
}

export function validateIntent(value: unknown): QueryIntent {
  if (typeof value !== "string") return "mixed";
  const valid: QueryIntent[] = ["statute_lookup", "case_analysis", "internal_doc_search", "mixed"];
  return valid.includes(value as QueryIntent) ? (value as QueryIntent) : "mixed";
}

export function validateSubQueries(
  raw: unknown,
  originalQuery: string,
  defaultJurisdiction?: string
): SubQuery[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ query: originalQuery, source_type: "all", ...(defaultJurisdiction ? { jurisdiction: defaultJurisdiction } : {}) }];
  }

  const result: SubQuery[] = [];
  for (const item of raw.slice(0, 3)) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const query = typeof obj.query === "string" && obj.query.trim().length > 0
      ? obj.query.trim()
      : originalQuery;
    const sourceType = validateSourceType(obj.source_type);
    const jurisdiction = typeof obj.jurisdiction === "string" && obj.jurisdiction.trim().length > 0
      ? obj.jurisdiction.trim().toLowerCase()
      : defaultJurisdiction;
    result.push({
      query,
      source_type: sourceType,
      ...(jurisdiction ? { jurisdiction } : {}),
    });
  }

  return result.length > 0
    ? result
    : [{ query: originalQuery, source_type: "all", ...(defaultJurisdiction ? { jurisdiction: defaultJurisdiction } : {}) }];
}

export function validateSourceType(value: unknown): SubQuery["source_type"] {
  if (value === "statutes" || value === "internal" || value === "all") return value;
  return "all";
}

/**
 * Resolve source scoping for a sub-query based on its source_type.
 *
 * - "statutes": scope to the law corpus source for the jurisdiction
 * - "internal": scope to the caller's own sources (exclude law-* sources)
 * - "all": no source restriction (use caller's existing scope)
 */
function resolveSourceScope(
  sourceType: SubQuery["source_type"],
  jurisdiction: string | undefined,
  opts: QueryPlannerOpts
): { sourceId?: string; sourceIds?: string[] } {
  if (sourceType === "statutes" && jurisdiction) {
    const lawSource = LEGAL_SOURCE_BY_JURISDICTION[jurisdiction as keyof typeof LEGAL_SOURCE_BY_JURISDICTION];
    if (lawSource) {
      return { sourceIds: [lawSource] };
    }
  }

  if (sourceType === "internal") {
    // If the caller has sourceIds, filter out law-* sources
    if (opts.sourceIds) {
      const internalOnly = opts.sourceIds.filter(sid => !sid.startsWith("law-"));
      if (internalOnly.length > 0) return { sourceIds: internalOnly };
    }
    if (opts.sourceId && !opts.sourceId.startsWith("law-")) {
      return { sourceId: opts.sourceId };
    }
    // No internal sources available — return empty to skip
    return { sourceIds: [] };
  }

  // "all" — use caller's existing scope
  if (opts.sourceIds) return { sourceIds: opts.sourceIds };
  if (opts.sourceId) return { sourceId: opts.sourceId };
  return {};
}
