import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
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
    body: pipelineSchema,
  },
  async (_ctx, body, _query, _req) => {
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

    return Response.json(result);
  }
);
