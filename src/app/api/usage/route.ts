
import { usageFor } from "@/lib/usage";
import { limitsFor } from "@/lib/plans";
import { createHandler } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    const usage = await usageFor(ctx.brainId);
    return Response.json({
      month: usage.month,
      queries: usage.queries,
      plan: ctx.plan,
      limits: limitsFor(ctx.plan),
      shared: ctx.brainId !== ctx.user.brainId,
    });
  },
);
