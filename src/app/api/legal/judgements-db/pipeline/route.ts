import { z } from "zod";
import { createHandler, recordCreditConsumption } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { runPipeline } from "@/lib/legal-graph/pipeline";

export const maxDuration = 60;

const pipelineSchema = z.object({
  query: z.string().min(1),
  rerank: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  rerankTopK: z
    .string()
    .transform((v) => parseInt(v, 10) || 20)
    .default("20"),
  graphSearch: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  validateCitations: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  maxResults: z
    .string()
    .transform((v) => parseInt(v, 10) || 20)
    .default("20"),
  jurisdiction: z.string().default("de"),
});

export const POST = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    // Router, LLM reranking, citation validation and a synthesised answer —
    // a multi-agent run, priced like the research agent.
    credits: "agent",
    body: pipelineSchema,
    audit: (_ctx, body) => ({
      action: "judgements.search" as const,
      entityType: "judgement_pipeline",
      details: {
        query: body.query.slice(0, 200),
        rerank: body.rerank,
        graphSearch: body.graphSearch,
        validateCitations: body.validateCitations,
        maxResults: body.maxResults,
        jurisdiction: body.jurisdiction,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    const result = await runPipeline(pool, body.query, {
      rerank: body.rerank,
      rerankTopK: body.rerankTopK,
      graphSearch: body.graphSearch,
      validateCitations: body.validateCitations,
      maxResults: body.maxResults,
      jurisdiction: body.jurisdiction,
    });

    // Charged when the synthesis produced an answer (a failed run is free).
    if (result.steps.some((s) => s.agent === "synthesis" && s.status === "done")) {
      void recordCreditConsumption(ctx, "agent");
    }

    return Response.json(result);
  }
);
