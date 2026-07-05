import { createHandler } from "@/lib/api-handler";
import { listFeatureFlags, isFeatureEnabled } from "@/lib/feature-flags";
import { z } from "zod";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      key: z.string().optional(),
    }),
  },
  async (ctx, _body, query) => {
    if (query.key) {
      const enabled = await isFeatureEnabled(query.key, {
        userId: ctx.user.id,
        plan: ctx.user.plan,
        role: ctx.user.role,
      });
      return Response.json({ key: query.key, enabled });
    }

    const flags = await listFeatureFlags();
    const results = await Promise.all(
      flags.map(async (f) => ({
        key: f.key,
        name: f.name,
        enabled: await isFeatureEnabled(f.key, {
          userId: ctx.user.id,
          plan: ctx.user.plan,
          role: ctx.user.role,
        }),
      }))
    );
    return Response.json({ flags: results });
  }
);
