import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { bankFeedFromEnv } from "@/lib/fibu-bank-feed.server";
import { importAndMatchTransactions } from "@/lib/fibu-import.server";

const schema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: schema,
    audit: (_ctx, body) => ({
      action: "fibu.bank_feed" as const,
      entityType: "bank_transaction",
      details: { from: body.from, to: body.to },
    }),
  },
  async (ctx, body) => {
    const provider = bankFeedFromEnv();
    if (!provider)
      return apiError(
        "bank_feed_not_configured",
        "Open-Banking-Zugang ist nicht konfiguriert",
        400
      );
    const to = body.to ?? new Date().toISOString().slice(0, 10);
    const from = body.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const transactions = await provider.fetchTransactions({ from, to });
    let result;
    try {
      result = await importAndMatchTransactions(ctx.headers, transactions, {
        brainId: ctx.brainId,
      });
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    return apiSuccess({ provider: provider.name, ...result });
  }
);
