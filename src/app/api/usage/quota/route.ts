import { createHandler } from "@/lib/api-handler";
import { usageFor } from "@/lib/usage";
import { limitsFor, getModelUsage } from "@/lib/plans";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    const usage = await usageFor(ctx.brainId);
    const modelBreakdown = await getModelUsage(ctx.brainId);
    const limits = limitsFor(ctx.plan);
    return Response.json({
      month: usage.month,
      queries: usage.queries,
      plan: ctx.plan,
      limits,
      modelBreakdown,
      shared: ctx.brainId !== ctx.user.brainId,
    });
  }
);
