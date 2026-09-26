import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { listEnginePages } from "@/lib/engine-pages";
import { redactPageSecrets } from "@/lib/kanzlei-settings-secrets";
import { hideForeignPersonalEvents } from "@/lib/calendar/personal-events";

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
          // Other users' personal calendar mirrors are theirs alone.
          results[type] = hideForeignPersonalEvents(
            redactPageSecrets(
              await listEnginePages(ctx.headers, type, body.limit, {
                timeoutMs: 20_000,
                // Strict: a mid-scan failure must land in `errors`, not surface
                // a truncated list that the UI would render as "no entries".
                strict: true,
              })
            ),
            ctx.user?.id
          );
        } catch {
          errors.push(type);
        }
      })
    );

    return Response.json({ results, errors });
  }
);
