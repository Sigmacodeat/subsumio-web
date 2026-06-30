import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import {
  computeGraphEmbeddings,
  ensureGraphEmbeddingsTable,
} from "@/lib/legal-graph/graph-embeddings";

export const maxDuration = 60;

const graphSchema = z.object({
  action: z.enum(["compute", "status"]).default("status"),
  hops: z
    .string()
    .transform((v) => parseInt(v, 10) || 2)
    .default("2"),
  sampleSize: z
    .string()
    .transform((v) => parseInt(v, 10) || 10)
    .default("10"),
  batchSize: z
    .string()
    .transform((v) => parseInt(v, 10) || 100)
    .default("100"),
});

export const GET = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    query: graphSchema,
    cacheMaxAge: 30,
  },
  async (_ctx, _body, query, _req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    if (query.action === "status") {
      await ensureGraphEmbeddingsTable(pool);
      const result = await pool.query(`
        SELECT
          count(*)::int as total_embeddings,
          avg(neighbour_count)::float8 as avg_neighbours,
          max(computed_at) as last_computed
        FROM subsumio_judgement_graph_embeddings
      `);
      return Response.json(result.rows[0]);
    }

    return Response.json({ error: "Use POST for compute action" }, { status: 400 });
  }
);

export const POST = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    body: graphSchema,
  },
  async (_ctx, body, _query, _req) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return Response.json({ error: "Database not configured" }, { status: 503 });
    }

    if (body.action === "compute") {
      await ensureGraphEmbeddingsTable(pool);
      const result = await computeGraphEmbeddings(pool, {
        hops: body.hops,
        sampleSize: body.sampleSize,
        batchSize: body.batchSize,
      });
      return Response.json(result);
    }

    if (body.action === "status") {
      await ensureGraphEmbeddingsTable(pool);
      const result = await pool.query(`
        SELECT
          count(*)::int as total_embeddings,
          avg(neighbour_count)::float8 as avg_neighbours,
          max(computed_at) as last_computed
        FROM subsumio_judgement_graph_embeddings
      `);
      return Response.json(result.rows[0]);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  }
);
