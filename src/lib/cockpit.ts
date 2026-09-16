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

export async function fetchPagesByType(
  headers: Record<string, string>,
  type: string,
  limit: number
): Promise<BrainPage[]> {
  try {
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("limit", String(limit));
    const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as BrainPage[]) : [];
  } catch {
    return [];
  }
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
