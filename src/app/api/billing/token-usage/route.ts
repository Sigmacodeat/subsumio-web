/**
 * Token Usage API — Token-genaue Usage-Statistiken für Dashboard
 *
 * GET /api/billing/token-usage           — Token-Usage pro Modell (diesen Monat)
 * GET /api/billing/token-usage?since=2026-01-01&until=2026-02-01
 *
 * Gibt zurück: pro Modell → totalCredits, totalInputTokens, totalCachedTokens,
 * totalOutputTokens, callCount. Wie OpenAI Usage Dashboard.
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getTokenUsageByModel, type OwnerType } from "@/lib/billing/credits";

const tokenUsageQuerySchema = z.object({
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

export const GET = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    cacheMaxAge: 30,
    query: tokenUsageQuerySchema,
  },
  async (ctx, _body, query) => {
    const ownerType: OwnerType = ctx.user.orgId ? "org" : "user";
    const ownerId = ctx.user.orgId ?? ctx.user.id;

    const since = query?.since ? new Date(query.since) : undefined;
    const until = query?.until ? new Date(query.until) : undefined;

    const usage = await getTokenUsageByModel(ownerId, ownerType, { since, until });

    const totalCredits = usage.reduce((s, r) => s + r.totalCredits, 0);
    const totalInputTokens = usage.reduce((s, r) => s + r.totalInputTokens, 0);
    const totalCachedTokens = usage.reduce((s, r) => s + r.totalCachedTokens, 0);
    const totalCacheCreateTokens = usage.reduce((s, r) => s + r.totalCacheCreateTokens, 0);
    const totalOutputTokens = usage.reduce((s, r) => s + r.totalOutputTokens, 0);
    const totalCalls = usage.reduce((s, r) => s + r.callCount, 0);

    return Response.json({
      ok: true,
      usage,
      totals: {
        totalCredits: Math.round(totalCredits * 100) / 100,
        totalInputTokens,
        totalCachedTokens,
        totalCacheCreateTokens,
        totalOutputTokens,
        totalCalls,
        cacheHitRate:
          totalInputTokens + totalCachedTokens > 0
            ? totalCachedTokens / (totalInputTokens + totalCachedTokens)
            : 0,
      },
    });
  }
);
