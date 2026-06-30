import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import {
  classifyCitationsForJudgement,
  batchValidateCitations,
  aggregateTreatments,
} from "@/lib/legal-graph/validation";
import {
  buildCitationGraphForJudgement,
  buildCitationGraphBatch,
} from "@/lib/legal-graph/citations";

export const maxDuration = 60;

const validateSchema = z.object({
  action: z
    .enum(["classify_judgement", "batch_classify", "build_graph", "build_graph_batch", "aggregate"])
    .default("aggregate"),
  judgementId: z.string().default(""),
  batchSize: z
    .string()
    .transform((v) => parseInt(v, 10) || 50)
    .default("50"),
  maxItems: z
    .string()
    .transform((v) => parseInt(v, 10) || 500)
    .default("500"),
});

export const POST = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    body: validateSchema,
  },
  async (_ctx, body, _query, _req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    switch (body.action) {
      case "classify_judgement": {
        if (!body.judgementId) {
          return Response.json({ error: "judgementId required" }, { status: 400 });
        }
        const result = await classifyCitationsForJudgement(pool, body.judgementId);
        return Response.json({ judgementId: body.judgementId, ...result });
      }

      case "batch_classify": {
        const result = await batchValidateCitations(pool, {
          batchSize: body.batchSize,
          maxItems: body.maxItems,
        });
        return Response.json(result);
      }

      case "build_graph": {
        if (!body.judgementId) {
          return Response.json({ error: "judgementId required" }, { status: 400 });
        }
        const result = await buildCitationGraphForJudgement(pool, body.judgementId);
        return Response.json({ judgementId: body.judgementId, ...result });
      }

      case "build_graph_batch": {
        const result = await buildCitationGraphBatch(pool, {
          batchSize: body.batchSize,
          maxItems: body.maxItems,
        });
        return Response.json(result);
      }

      case "aggregate": {
        if (!body.judgementId) {
          return Response.json({ error: "judgementId required" }, { status: 400 });
        }
        const result = await aggregateTreatments(pool, body.judgementId);
        return Response.json(result);
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  }
);
