import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { recordQuery } from "@/lib/usage";
import { sanitizeTypeFilter, buildSearchParams } from "@/lib/search-params";
import { createHandler, recordQuota } from "@/lib/api-handler";

const searchQuerySchema = z.object({
  q: z.string().default(""),
  limit: z
    .string()
    .transform((v) => Math.min(parseInt(v, 10) || 10, 100))
    .default("10"),
  type: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "query.submit",
    rateTier: "search",
    quota: "queries",
    query: searchQuerySchema,
    cacheMaxAge: 30,
    audit: (ctx, _body, query) => ({
      action: "query.submit" as const,
      entityType: "search",
      details: { q: query.q, type: query.type },
    }),
  },
  async (ctx, _body, query, _req) => {
    const q = query.q;
    const typeFilter = sanitizeTypeFilter(query.type || "");

    if (q.trim()) {
      void recordQuery(ctx.brainId);
      void recordQuota(ctx, "queries");
    }

    try {
      const params = buildSearchParams(q, String(query.limit), typeFilter);

      const res = await fetch(`${ENGINE_URL}/api/search?${params.toString()}`, {
        headers: ctx.headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error(
        "[search] engine search failed:",
        err instanceof Error ? err.message : String(err)
      );
      return Response.json([]);
    }
  }
);
