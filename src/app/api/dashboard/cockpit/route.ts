import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { DEFAULT_TYPES, fetchPagesByType, fetchRecentQueries, fetchStats } from "@/lib/cockpit";
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
