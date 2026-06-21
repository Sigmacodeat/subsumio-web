import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

const graphQuerySchema = z.object({
  limit: z
    .string()
    .transform((v) => Math.min(parseInt(v, 10) || 200, 500))
    .default("200"),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: graphQuerySchema,
    cacheMaxAge: 30,
  },
  async (ctx, _body, query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/graph?limit=${query.limit}`, {
        headers: ctx.headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json(await res.json());
    } catch (err) {
      console.error("[graph] failed:", err instanceof Error ? err.message : String(err));
      return Response.json({ nodes: [], links: [] });
    }
  }
);
