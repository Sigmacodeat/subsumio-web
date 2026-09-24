import { ENGINE_URL } from "@/lib/engine";
import type { BrainPage, BrainStats, RecentQuery } from "@/lib/types";

export const DEFAULT_TYPES: Record<string, number> = {
  legal_case: 50,
  legal_deadline: 50,
  invoice: 50,
  intake_request: 20,
  bea_draft: 20,
  bea_message: 20,
  document_request: 50,
  signature_request: 50,
  review_item: 20,
  agent_action: 50,
  document: 100,
  legal_document: 100,
};

/** A page-list read that says whether it succeeded — an empty list and a
 *  failed read must never look the same (a hidden Frist is a malpractice
 *  risk). */
export interface PageListResult {
  pages: BrainPage[];
  ok: boolean;
}

export async function fetchPagesByTypeResult(
  headers: Record<string, string>,
  type: string,
  limit: number
): Promise<PageListResult> {
  try {
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("limit", String(limit));
    const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { pages: [], ok: false };
    const data = await res.json();
    return Array.isArray(data)
      ? { pages: data as BrainPage[], ok: true }
      : { pages: [], ok: false };
  } catch {
    return { pages: [], ok: false };
  }
}

/** Lenient variant: `[]` on failure. Prefer `fetchPagesByTypeResult` wherever
 *  the caller can surface a failed read. */
export async function fetchPagesByType(
  headers: Record<string, string>,
  type: string,
  limit: number
): Promise<BrainPage[]> {
  return (await fetchPagesByTypeResult(headers, type, limit)).pages;
}

export async function fetchPagesByTypes(
  headers: Record<string, string>,
  typesMap: Record<string, number>
): Promise<Record<string, BrainPage[]>> {
  const results = await Promise.all(
    Object.entries(typesMap).map(([type, limit]) => fetchPagesByType(headers, type, limit))
  );
  const pages: Record<string, BrainPage[]> = {};
  Object.keys(typesMap).forEach((type, i) => {
    pages[type] = results[i] ?? [];
  });
  return pages;
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
