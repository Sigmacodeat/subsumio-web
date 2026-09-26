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
  /** Types with more pages than were read — their counts are lower bounds
   *  and the UI shows them as "N+", never as a total. */
  capped_types: string[];
}

/** Upper bound for a caller-chosen read budget (`types=legal_case:NNN`). */
const MAX_TYPE_LIMIT = 2000;

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
            const parsed = limitStr ? parseInt(limitStr, 10) : 50;
            const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
            return [type, Math.min(limit, MAX_TYPE_LIMIT)];
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
    const cappedTypes: string[] = [];
    const typeKeys = Object.keys(typesMap);
    for (let i = 0; i < typeKeys.length; i++) {
      const result = pageResults[i];
      pages[typeKeys[i]] = result?.pages ?? [];
      if (!result?.ok) failedTypes.push(typeKeys[i]);
      if (result?.capped) cappedTypes.push(typeKeys[i]);
    }

    const response: CockpitResponse = {
      stats,
      recent,
      pages,
      degraded: failedTypes.length > 0,
      failed_types: failedTypes,
      capped_types: cappedTypes,
    };
    return Response.json(response);
  }
);
