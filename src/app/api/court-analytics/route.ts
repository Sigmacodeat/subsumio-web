import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  aggregateCourtAnalytics,
  ANALYTICS_DISCLAIMER_DE,
  DEFAULT_ANALYTICS_CONFIG,
  type CourtAnalytics,
} from "@/lib/court-analytics";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  court: z.string().max(200).optional(),
  chamber: z.string().max(200).optional(),
  legal_area: z.string().max(100).optional(),
});

export const GET = createHandler(
  {
    action: "legal.research",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const headers = ctx.headers;
    const params = new URLSearchParams({ type: "judgement", limit: "500" });
    if (query?.court) params.set("court", query.court);
    if (query?.legal_area) params.set("legal_area", query.legal_area);

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return apiSuccess({
        analytics: [] as CourtAnalytics[],
        config: DEFAULT_ANALYTICS_CONFIG,
        disclaimer: ANALYTICS_DISCLAIMER_DE,
      });
    }

    const data = await res.json();
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
      frontmatter: Record<string, unknown>;
    }>;

    const judgements = pages.map((p) => ({
      court: (p.frontmatter.court as string) ?? "Unknown",
      chamber: p.frontmatter.chamber as string | undefined,
      duration_days: p.frontmatter.duration_days as number | undefined,
      outcome: p.frontmatter.outcome as string | undefined,
      citation_count: p.frontmatter.citation_count as number | undefined,
      legal_area: p.frontmatter.legal_area as string | undefined,
    }));

    const analytics = aggregateCourtAnalytics(judgements);

    return apiSuccess({
      analytics,
      config: DEFAULT_ANALYTICS_CONFIG,
      disclaimer: ANALYTICS_DISCLAIMER_DE,
    });
  }
);
