/**
 * Admin Token Usage API — Tenant-weite Token-Usage-Analytics.
 *
 * GET /api/admin/token-usage           — letzte 30 Tage
 * GET /api/admin/token-usage?days=7    — letzte 7 Tage
 * GET /api/admin/token-usage?since=ISO&until=ISO
 *
 * Gibt zurück: perUser Leaderboard, perModel Breakdown, dailyTrend, totals.
 * Wie OpenAI Global Admin Console Analytics.
 *
 * Admin-only (RBAC via createHandler action: "admin.read").
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getAdminTokenUsageOverview } from "@/lib/billing/credits";

const adminTokenUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

export const GET = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    cacheMaxAge: 60,
    query: adminTokenUsageQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    const opts: { since?: Date; until?: Date; days?: number } = {};
    if (query?.since) opts.since = new Date(query.since);
    if (query?.until) opts.until = new Date(query.until);
    if (query?.days) opts.days = query.days;

    const overview = await getAdminTokenUsageOverview(opts);

    return Response.json({
      ok: true,
      ...overview,
    });
  }
);
