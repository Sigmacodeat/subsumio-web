import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { bankFeedFromEnv } from "@/lib/fibu-bank-feed.server";
import { autoMatchTransaction, applyMatch, type OpenItem } from "@/lib/fibu";

const schema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export const POST = createHandler(
  { action: "brain.write", rateTier: "heavy", body: schema },
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
    const params = new URLSearchParams({ type: "open_item", limit: "500" });
    const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, { headers: ctx.headers });
    const data = response.ok ? await response.json() : [];
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
      frontmatter: OpenItem;
    }>;
    let openItems = pages.map((page) => page.frontmatter);
    let matched = 0;
    for (const transaction of transactions) {
      const match = autoMatchTransaction(transaction, openItems);
      const result = match ? applyMatch(transaction, match, openItems) : { transaction, openItems };
      if (match) matched++;
      openItems = result.openItems;
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/bank-transactions/${transaction.id}`,
          title: `Bankbuchung ${transaction.date}`,
          type: "bank_transaction",
          frontmatter: result.transaction,
        }),
      });
    }
    return apiSuccess({ provider: provider.name, imported: transactions.length, matched });
  }
);
