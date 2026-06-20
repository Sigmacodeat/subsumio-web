
import { z } from "zod";
import { searchJudgements } from "@/lib/judgements";
import { createHandler } from "@/lib/api-handler";

export const maxDuration = 30;

const judgementsSearchSchema = z.object({
  q: z.string().min(1, "Query parameter 'q' is required"),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("at"),
  court: z.string().default(""),
  from: z.string().default(""),
  to: z.string().default(""),
  page: z.string().transform((v) => Math.max(parseInt(v, 10) || 0, 0)).default("0"),
  limit: z.string().transform((v) => Math.min(parseInt(v, 10) || 20, 50)).default("20"),
});

export const GET = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    query: judgementsSearchSchema,
    cacheMaxAge: 60,
    audit: (_ctx, _body, query) => ({
      action: "judgements.search" as const,
      entityType: "judgement",
      details: { q: query.q, jurisdiction: query.jurisdiction },
    }),
  },
  async (_ctx, _body, query, _req) => {
    const { results, errors } = await searchJudgements({
      q: query.q,
      jurisdiction: query.jurisdiction,
      court: query.court,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.limit,
    });

    return Response.json({
      jurisdiction: query.jurisdiction,
      query: query.q,
      court: query.court,
      results,
      total: results.length,
      page: query.page,
      limit: query.limit,
      ...(errors.length > 0 && results.length === 0
        ? { error: `Quelle(n) nicht erreichbar: ${errors.join("; ")}` }
        : {}),
    });
  },
);
