import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { listEnginePages } from "@/lib/engine-pages";

const batchListSchema = z.object({
  types: z.array(z.string().min(1).max(64)).min(1).max(20),
  /** Read in batches of 100; the engine returns no more per request. */
  limit: z.number().int().min(1).max(50_000).default(100),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: batchListSchema,
    // Plain list read (fires on almost every dashboard page load): not audited.
  },
  async (ctx, body) => {
    const results: Record<string, unknown[]> = {};
    const errors: string[] = [];

    await Promise.all(
      body.types.map(async (type) => {
        try {
          results[type] = await listEnginePages(ctx.headers, type, body.limit, {
            timeoutMs: 20_000,
          });
        } catch {
          errors.push(type);
        }
      })
    );

    return Response.json({ results, errors });
  }
);
