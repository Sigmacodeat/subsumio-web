import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import type { BrainPage, BrainStats, RecentQuery } from "@/lib/types";

const cockpitQuerySchema = z.object({
  types: z.string().optional(),
  recent_limit: z.string().optional(),
});

interface CockpitResponse {
  stats: BrainStats | null;
  recent: RecentQuery[];
  pages: Record<string, BrainPage[]>;
}

async function fetchPagesByType(
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

async function fetchStats(headers: Record<string, string>): Promise<BrainStats | null> {
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

async function fetchRecentQueries(
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

const DEFAULT_TYPES: Record<string, number> = {
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

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: cockpitQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    const typesParam = query.types;
    const recentLimit = query.recent_limit ? parseInt(query.recent_limit, 10) : 5;

    const typesMap = typesParam
      ? Object.fromEntries(
          typesParam.split(",").map((t) => {
            const [type, limitStr] = t.split(":");
            return [type, limitStr ? parseInt(limitStr, 10) : 50];
          })
        )
      : DEFAULT_TYPES;

    const [stats, recent, ...pageResults] = await Promise.all([
      fetchStats(ctx.headers),
      fetchRecentQueries(ctx.headers, recentLimit),
      ...Object.entries(typesMap).map(([type, limit]) =>
        fetchPagesByType(ctx.headers, type, limit)
      ),
    ]);

    const pages: Record<string, BrainPage[]> = {};
    const typeKeys = Object.keys(typesMap);
    for (let i = 0; i < typeKeys.length; i++) {
      pages[typeKeys[i]] = pageResults[i] ?? [];
    }

    const response: CockpitResponse = { stats, recent, pages };
    return Response.json(response);
  }
);
