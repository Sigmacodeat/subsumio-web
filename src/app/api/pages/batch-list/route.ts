import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

const batchListSchema = z.object({
  types: z.array(z.string().min(1).max(64)).min(1).max(20),
  limit: z.number().int().min(1).max(500).default(100),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: batchListSchema,
  },
  async (ctx, body) => {
    const results: Record<string, unknown[]> = {};
    const errors: string[] = [];

    await Promise.all(
      body.types.map(async (type) => {
        try {
          const params = new URLSearchParams({
            type,
            limit: String(body.limit),
          });
          const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
            headers: ctx.headers,
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            errors.push(type);
            return;
          }
          const data = await res.json();
          results[type] = Array.isArray(data) ? data : (data.items ?? []);
        } catch {
          errors.push(type);
        }
      })
    );

    return Response.json({ results, errors });
  }
);
