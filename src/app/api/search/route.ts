import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { recordQuery } from "@/lib/usage";
import { sanitizeTypeFilter, buildSearchParams } from "@/lib/search-params";
import { createHandler, apiError } from "@/lib/api-handler";

import { logger } from "@/lib/logger";
const log = logger("api/search");

const searchQuerySchema = z.object({
  q: z.string().max(2_000).default(""),
  limit: z
    .string()
    .transform((v) => Math.max(1, Math.min(parseInt(v, 10) || 10, 100)))
    .default("10"),
  type: z.string().max(200).optional(),
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

    // The quota unit is booked by the request guard (quota: "queries"); a
    // second booking here counted every search twice.
    if (q.trim()) void recordQuery(ctx.brainId);

    try {
      const params = buildSearchParams(q, String(query.limit), typeFilter);

      const res = await fetch(`${ENGINE_URL}/api/search?${params.toString()}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      log.error("[search] engine search failed:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Suche derzeit nicht verfügbar", 503);
    }
  }
);
