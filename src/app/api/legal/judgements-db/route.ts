import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { hybridSearch } from "@/lib/legal-graph/search";
import { embedQuery, checkEmbeddingAvailability } from "@/lib/legal-graph/embedding";
import { rerankResults } from "@/lib/legal-graph/reranking";

export const maxDuration = 30;

const searchSchema = z.object({
  q: z.string().min(1),
  jurisdiction: z.string().default("de"),
  court: z.string().default(""),
  courtLevel: z.string().default(""),
  legalArea: z.string().default(""),
  dateFrom: z.string().default(""),
  dateTo: z.string().default(""),
  treatmentStatus: z.string().default(""),
  limit: z
    .string()
    .transform((v) => Math.min(parseInt(v, 10) || 20, 50))
    .default("20"),
  offset: z
    .string()
    .transform((v) => Math.max(parseInt(v, 10) || 0, 0))
    .default("0"),
  rerank: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  rerankTopK: z
    .string()
    .transform((v) => parseInt(v, 10) || 20)
    .default("20"),
});

export const GET = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    query: searchSchema,
    cacheMaxAge: 60,
    audit: (_ctx, _body, query) => ({
      action: "judgements.search" as const,
      entityType: "judgement",
      details: { q: query.q, jurisdiction: query.jurisdiction },
    }),
  },
  async (_ctx, _body, query, _req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    // Try to embed the query for hybrid search
    let queryEmbedding: number[] | undefined;
    try {
      const availability = await checkEmbeddingAvailability();
      if (availability.available) {
        const vec = await embedQuery(query.q);
        queryEmbedding = Array.from(vec);
      }
    } catch {
      // Embedding failed — fall back to BM25-only search
    }

    const { results, total, mode } = await hybridSearch(
      pool,
      {
        q: query.q,
        jurisdiction: query.jurisdiction || undefined,
        court: query.court || undefined,
        courtLevel: query.courtLevel || undefined,
        legalArea: query.legalArea || undefined,
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
        treatmentStatus: query.treatmentStatus || undefined,
        limit: query.rerank ? Math.max(query.limit, query.rerankTopK) : query.limit,
        offset: 0,
      },
      queryEmbedding
    );

    // Apply cross-encoder reranking if requested
    let finalResults = results;
    let reranked = false;
    let rerankModel = "";
    if (query.rerank && results.length > 0) {
      const rerankResult = await rerankResults(query.q, results, { topK: query.rerankTopK });
      finalResults = rerankResult.results;
      reranked = rerankResult.reranked;
      rerankModel = rerankResult.model;
    }

    // Apply offset + limit after reranking
    const offset = query.offset;
    const limit = query.limit;
    const paginatedResults = finalResults.slice(offset, offset + limit);

    return Response.json({
      query: query.q,
      mode,
      total,
      limit,
      offset,
      reranked,
      rerank_model: rerankModel,
      results: paginatedResults,
    });
  }
);
