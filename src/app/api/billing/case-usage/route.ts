/**
 * Case Usage API — Mandanten-Abrechnung
 *
 * GET /api/billing/case-usage          — credit usage per case slug
 * GET /api/billing/case-usage?csv=1    — CSV export for invoicing
 */

import { createHandler } from "@/lib/api-handler";
import { getCaseUsage, caseUsageToCsv, type OwnerType } from "@/lib/billing/credits";

export const GET = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, query, req) => {
    const ownerType: OwnerType = ctx.user.orgId ? "org" : "user";
    const ownerId = ctx.user.orgId ?? ctx.user.id;

    const sinceParam = query?.since as string | undefined;
    const untilParam = query?.until as string | undefined;
    const since = sinceParam ? new Date(sinceParam) : undefined;
    const until = untilParam ? new Date(untilParam) : undefined;

    const usage = await getCaseUsage(ownerId, ownerType, { since, until });

    const url = new URL(req.url);
    if (url.searchParams.get("csv") === "1") {
      const csv = caseUsageToCsv(usage);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ai-costs-per-case-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return Response.json({ usage });
  }
);
