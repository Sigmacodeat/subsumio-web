/**
 * LAB-DACH v3 — Retrieval Adapter
 *
 * Bridges the LAB-DACH agent tools (search_law / search_judikatur) to the REAL
 * production hybrid search engine, replacing the naive file-based fallback in
 * agent-tools.ts.
 *
 * WHY THIS EXISTS: the first live run (docs/eval-runs/live-001) scored 0/7
 * all-pass because e2e-harness built the ToolContext WITHOUT a searchFn, so
 * search_law fell back to a keyword grep over corpus files. That fallback never
 * surfaced procedural §§ (ZPO/EO), so every cited § was flagged ungrounded by
 * the fail-closed citation guardrail. The engine's real retrieval, by contrast,
 * scores hit@3 = 100% across all AT domains (legal-at-retrieval-quality gate).
 * This adapter makes the harness use that real retrieval.
 *
 * Two construction paths:
 *   createEngineSearchFn(engine)  — wraps ANY BrainEngine (hermetic tests seed a
 *                                   PGLite engine; production injects the live one).
 *   createLiveEngineSearch()      — connects to the configured production engine
 *                                   (Postgres via ~/.gbrain/config.json) where
 *                                   the full corpus is already imported + embedded.
 */

import type { BrainEngine } from "../../core/engine.ts";
import { hybridSearch } from "../../core/search/hybrid.ts";
import type {
  SearchOpts as AgentSearchOpts,
  SearchResult as AgentSearchResult,
} from "./agent-tools.ts";

export interface EngineSearchOpts {
  /**
   * Enable the LLM cross-encoder reranker (paragraph-level ranking). Default ON
   * — it is what lifts AT paragraph Hit@5 from 61.7% to 86.7%. Turn OFF for
   * hermetic tests that have no model/API key.
   */
  llmRerank?: boolean;
  /** Default result cap when the tool does not specify one. */
  defaultLimit?: number;
}

/** legal/statutes/<jur>/<abbr>/p-<N> or .../art-<N> → law abbr + § label. */
const STATUTE_SLUG = /^legal\/statutes\/[a-z]{2}\/([^/]+)\/(?:p|art)-(.+)$/i;

function deriveLawAndParagraph(slug: string): { law?: string; paragraph?: string } {
  const m = slug.match(STATUTE_SLUG);
  if (!m) return {};
  return { law: m[1].toUpperCase(), paragraph: `§ ${m[2]}` };
}

/**
 * Build an agent-tools searchFn backed by the real hybrid search engine.
 * The returned function matches ToolContext.searchFn exactly, so it can be
 * dropped into the ToolContext used by search_law / search_judikatur.
 */
export function createEngineSearchFn(
  engine: BrainEngine,
  opts: EngineSearchOpts = {}
): (query: string, o: AgentSearchOpts) => Promise<AgentSearchResult[]> {
  const llmRerank = opts.llmRerank ?? true;
  const defaultLimit = opts.defaultLimit ?? 8;

  return async (query, o) => {
    const limit = Math.min(o.limit ?? defaultLimit, 20);
    const results = await hybridSearch(engine, query, {
      limit,
      expansion: false,
      // Hard jurisdiction isolation — an AT query can never surface a DE/CH §.
      jurisdiction: o.jurisdiction,
      // Judikatur searches pass a source id (e.g. "law-at-judikatur").
      ...(o.source ? { sourceId: o.source } : {}),
      ...(llmRerank ? { llmRerank: { enabled: true } } : {}),
    });

    return results.map((r) => {
      const { law, paragraph } = deriveLawAndParagraph(r.slug);
      return {
        slug: r.slug,
        title: r.title,
        text: r.chunk_text,
        score: r.score,
        law,
        paragraph,
      } satisfies AgentSearchResult;
    });
  };
}

export interface LiveEngineHandle {
  searchFn: (query: string, o: AgentSearchOpts) => Promise<AgentSearchResult[]>;
  /** Disconnect the underlying engine — call after the run completes. */
  disconnect: () => Promise<void>;
}

/**
 * Connect to the configured production engine and return a ready-to-inject
 * searchFn. The caller owns the lifecycle — call `disconnect()` when done.
 *
 * Throws if no engine is configured (DATABASE_URL / ~/.gbrain/config.json),
 * which is the correct fail-closed behaviour for a live benchmark: a live run
 * must not silently degrade to file-based search.
 */
export async function createLiveEngineSearch(
  opts: EngineSearchOpts = {}
): Promise<LiveEngineHandle> {
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { reconfigureGatewayWithEngine } = await import("../../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) {
    throw new Error(
      "LAB-DACH live retrieval refused: no engine configured. " +
        "Set DATABASE_URL or ~/.gbrain/config.json, or run with --retrieval file."
    );
  }
  const engineCfg = toEngineConfig(cfg);

  const engine = await createEngine(engineCfg);
  await engine.connect(engineCfg);
  try {
    // Ensure the gateway routes embeddings through the same engine/config.
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Gateway may already be configured by the caller; non-fatal.
  }

  return {
    searchFn: createEngineSearchFn(engine, opts),
    disconnect: () => engine.disconnect(),
  };
}
