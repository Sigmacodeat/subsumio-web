import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { isTombstoned } from "@/lib/tombstone";
import type { BrainPage, BrainStats, RecentQuery } from "@/lib/types";

/**
 * Read budget per type. Counts on the overview (Akten, Rechnungen, …) come
 * from these lists, so the budget is generous; a type that has more pages than
 * its budget is reported as capped (`capped_types`) and shown as "N+", never
 * as an exact total.
 */
export const DEFAULT_TYPES: Record<string, number> = {
  legal_case: 500,
  // Deadlines on the overviews come from the Fristen read model
  // (src/lib/fristen-read-model.ts); this list is only the fallback.
  legal_deadline: 200,
  invoice: 500,
  intake_request: 200,
  // bea_draft is intentionally absent: the beA dashboard is retired, so no
  // live surface consumes the type — fetching it would be dead engine load
  // on every cockpit/briefing request.
  bea_message: 50,
  document_request: 200,
  signature_request: 200,
  review_item: 100,
  agent_action: 100,
  document: 300,
  legal_document: 300,
};

/** A page-list read that says whether it succeeded — an empty list and a
 *  failed read must never look the same (a hidden Frist is a malpractice
 *  risk) — and whether it hit its budget (`capped`: there are more pages). */
export interface PageListResult {
  pages: BrainPage[];
  ok: boolean;
  capped: boolean;
}

/**
 * Up to `limit` pages of a type, most recently updated first, paged through
 * the engine cursor (one request is clamped to 100 rows). Deleted
 * (tombstoned) pages are left out; a failed batch fails the whole read.
 */
export async function fetchPagesByTypeResult(
  headers: Record<string, string>,
  type: string,
  limit: number
): Promise<PageListResult> {
  try {
    // One row over budget tells "exactly `limit`" apart from "more".
    const raw = await listEnginePages(headers, type, limit + 1, {
      strict: true,
      includeTombstoned: true,
      timeoutMs: 10_000,
    });
    const capped = raw.length > limit;
    const pages = (capped ? raw.slice(0, limit) : raw).filter((p) => !isTombstoned(p));
    return { pages: pages as unknown as BrainPage[], ok: true, capped };
  } catch {
    return { pages: [], ok: false, capped: false };
  }
}

export interface PageListsResult {
  pages: Record<string, BrainPage[]>;
  /** Types whose read failed — their lists are empty, not "none". */
  failedTypes: string[];
  /** Types with more pages than their budget — counts are lower bounds. */
  cappedTypes: string[];
}

export async function fetchPagesByTypesResult(
  headers: Record<string, string>,
  typesMap: Record<string, number>
): Promise<PageListsResult> {
  const entries = Object.entries(typesMap);
  const results = await Promise.all(
    entries.map(([type, limit]) => fetchPagesByTypeResult(headers, type, limit))
  );
  const out: PageListsResult = { pages: {}, failedTypes: [], cappedTypes: [] };
  entries.forEach(([type], i) => {
    const result = results[i];
    out.pages[type] = result?.pages ?? [];
    if (!result?.ok) out.failedTypes.push(type);
    if (result?.capped) out.cappedTypes.push(type);
  });
  return out;
}

export async function fetchStats(headers: Record<string, string>): Promise<BrainStats | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/stats`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as BrainStats;
    return { ...data, engine_reachable: true };
  } catch {
    return {
      total_pages: 0,
      total_entities: 0,
      total_queries: 0,
      total_edges: 0,
      engine_reachable: false,
    };
  }
}

export async function fetchRecentQueries(
  headers: Record<string, string>,
  limit: number
): Promise<RecentQuery[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/queries/recent?limit=${limit}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as RecentQuery[]) : [];
  } catch {
    return [];
  }
}
