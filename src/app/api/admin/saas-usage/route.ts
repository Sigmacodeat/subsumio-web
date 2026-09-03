/**
 * Admin SaaS Usage API — Internal cost/margin analytics.
 *
 * GET /api/admin/saas-usage           — SaaS Usage (diesen Monat)
 * GET /api/admin/saas-usage?days=7    — letzte 7 Tage
 * GET /api/admin/saas-usage?since=ISO&until=ISO
 * GET /api/admin/saas-usage?orgId=UUID — nur eine Org
 *
 * Gibt zurück: byModel (cost/sell/margin pro Modell),
 *              byWorkflow (cost/sell/margin pro Workflow),
 *              totals (aggregierte Kosten, Marge, Margin%).
 *
 * Admin-only (RBAC via createHandler action: "admin.read").
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getSaaSUsageOverview } from "@/lib/billing/saas-usage";

const saasUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  orgId: z.string().uuid().optional(),
});

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    cacheMaxAge: 60,
    query: saasUsageQuerySchema,
  },
  async (_ctx, _body, query, _req) => {
    const opts: { since?: Date; until?: Date; orgId?: string } = {};

    if (query?.since) opts.since = new Date(query.since);
    if (query?.until) opts.until = new Date(query.until);
    if (query?.orgId) opts.orgId = query.orgId;

    if (query?.days && !opts.since) {
      const d = new Date();
      d.setDate(d.getDate() - query.days);
      opts.since = d;
    }

    const overview = await getSaaSUsageOverview(opts);

    return Response.json({
      ok: true,
      ...overview,
    });
  }
);
