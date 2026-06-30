import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import {
  bulkImportOpenLegalData,
  syncDeltaOpenLegalData,
  getJudgementStats,
} from "@/lib/legal-graph/import";
import { embedPendingChunks, checkEmbeddingAvailability } from "@/lib/legal-graph/embedding";

export const maxDuration = 60;

const importSchema = z.object({
  action: z.enum(["bulk", "sync", "stats", "embed", "embed_status"]).default("stats"),
  maxPages: z
    .string()
    .transform((v) => parseInt(v, 10) || 10)
    .default("10"),
  pageSize: z
    .string()
    .transform((v) => parseInt(v, 10) || 100)
    .default("100"),
  dateAfter: z.string().default(""),
  fetchDetails: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  batchSize: z
    .string()
    .transform((v) => parseInt(v, 10) || 50)
    .default("50"),
  maxItems: z
    .string()
    .transform((v) => parseInt(v, 10) || 10000)
    .default("10000"),
});

export const GET = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    query: importSchema,
    cacheMaxAge: 30,
  },
  async (_ctx, _body, query, _req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    if (query.action === "stats") {
      const stats = await getJudgementStats(pool);
      return Response.json(stats);
    }

    if (query.action === "embed_status") {
      const availability = await checkEmbeddingAvailability();
      return Response.json(availability);
    }

    return Response.json({ error: "Use POST for import/sync/embed actions" }, { status: 400 });
  }
);

export const POST = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    body: importSchema,
  },
  async (_ctx, body, _query, _req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    if (body.action === "bulk") {
      const result = await bulkImportOpenLegalData(pool, {
        maxPages: body.maxPages,
        pageSize: body.pageSize,
        dateAfter: body.dateAfter || undefined,
        fetchDetails: body.fetchDetails,
      });
      return Response.json(result);
    }

    if (body.action === "sync") {
      const result = await syncDeltaOpenLegalData(pool);
      return Response.json(result);
    }

    if (body.action === "embed") {
      const result = await embedPendingChunks(pool, {
        batchSize: body.batchSize,
        maxItems: body.maxItems,
      });
      return Response.json(result);
    }

    if (body.action === "embed_status") {
      const availability = await checkEmbeddingAvailability();
      return Response.json(availability);
    }

    if (body.action === "stats") {
      const stats = await getJudgementStats(pool);
      return Response.json(stats);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  }
);
