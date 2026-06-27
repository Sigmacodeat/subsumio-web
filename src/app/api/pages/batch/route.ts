import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

const batchSchema = z.object({
  slugs: z.array(z.string().min(1).max(512)).min(1).max(100),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: batchSchema,
  },
  async (ctx, body) => {
    const results: Record<string, unknown> = {};
    const errors: string[] = [];

    const BATCH_SIZE = 10;
    for (let i = 0; i < body.slugs.length; i += BATCH_SIZE) {
      const batch = body.slugs.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (slug) => {
          if (slug.includes("..") || slug.includes("//")) {
            errors.push(slug);
            return;
          }
          try {
            const path = slug.split("/").map(encodeURIComponent).join("/");
            const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
              headers: ctx.headers,
              signal: AbortSignal.timeout(10_000),
            });
            if (res.ok) {
              results[slug] = await res.json();
            } else if (res.status !== 404) {
              errors.push(slug);
            }
          } catch {
            errors.push(slug);
          }
        })
      );
    }

    return Response.json({ pages: results, errors });
  }
);
