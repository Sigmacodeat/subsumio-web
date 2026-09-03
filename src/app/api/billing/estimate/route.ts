/**
 * Pipeline Estimate API — Pre-Pipeline Credit-Schätzung
 *
 * GET /api/billing/estimate?pages=50        — Schätzung mit auto-tier
 * GET /api/billing/estimate?pages=50&tier=2 — Schätzung mit explizitem tier
 * GET /api/billing/estimate?parts=3         — Schätzung basierend auf Part-Anzahl
 *
 * Gibt zurück:
 *   - estimatedCredits (was es kostet)
 *   - estimatedInputTokens / OutputTokens / CachedTokens (Token-Breakdown)
 *   - tier + layerCount (welche Pipeline-Komplexität)
 *   - balance (aktueller Credit-Stand, für "Hast du genug?")
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getBalance, type OwnerType } from "@/lib/billing/credits";
import { estimatePipelineCredits, recommendTier } from "@/lib/billing/credit-rate-card";

const estimateQuerySchema = z.object({
  pages: z.coerce.number().int().min(1).max(10_000).optional(),
  parts: z.coerce.number().int().min(1).max(1000).optional(),
  tier: z.coerce.number().int().min(1).max(3).optional(),
});

export const GET = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    cacheMaxAge: 10,
    query: estimateQuerySchema,
  },
  async (ctx, _body, query) => {
    const ownerType: OwnerType = ctx.user.orgId ? "org" : "user";
    const ownerId = ctx.user.orgId ?? ctx.user.id;

    // Determine page count: explicit pages > parts × 50 > default 50
    const pages = query?.pages ?? (query?.parts ? query.parts * 50 : 50);

    // Determine tier: explicit > auto-recommend
    const tier = (query?.tier ?? recommendTier(pages)) as 1 | 2 | 3;

    const estimate = estimatePipelineCredits(pages, tier);
    const { balance } = await getBalance(ownerId, ownerType);

    return Response.json({
      ok: true,
      estimate: {
        ...estimate,
        sufficient: balance >= estimate.estimatedCredits,
        balanceAfterPipeline: Math.max(
          0,
          Math.round((balance - estimate.estimatedCredits) * 100) / 100
        ),
      },
      balance,
    });
  }
);
