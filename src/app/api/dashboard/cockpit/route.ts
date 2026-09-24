import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import {
  DEFAULT_TYPES,
  fetchPagesByTypeResult,
  fetchRecentQueries,
  fetchStats,
} from "@/lib/cockpit";
import type { BrainPage, BrainStats, RecentQuery } from "@/lib/types";

const cockpitQuerySchema = z.object({
  types: z.string().optional(),
  recent_limit: z.string().optional(),
});

interface CockpitResponse {
  stats: BrainStats | null;
  recent: RecentQuery[];
  pages: Record<string, BrainPage[]>;
  /** true when any page list failed to load — the UI must show that its
   *  counts (Fristen, Akten, …) may be incomplete instead of reading "0". */
  degraded: boolean;
  failed_types: string[];
}

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
        fetchPagesByTypeResult(ctx.headers, type, limit)
      ),
    ]);

    const pages: Record<string, BrainPage[]> = {};
    const failedTypes: string[] = [];
    const typeKeys = Object.keys(typesMap);
    for (let i = 0; i < typeKeys.length; i++) {
      const result = pageResults[i];
      pages[typeKeys[i]] = result?.pages ?? [];
      if (!result?.ok) failedTypes.push(typeKeys[i]);
    }

    const response: CockpitResponse = {
      stats,
      recent,
      pages,
      degraded: failedTypes.length > 0,
      failed_types: failedTypes,
    };
    return Response.json(response);
  }
);
