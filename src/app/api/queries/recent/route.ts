import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

const recentQuerySchema = z.object({
  limit: z
    .string()
    .transform((v) => Math.min(parseInt(v, 10) || 10, 100))
    .default("10"),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: recentQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/queries/recent?limit=${query.limit}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json(await res.json());
    } catch (err) {
      console.error("[queries/recent] failed:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
