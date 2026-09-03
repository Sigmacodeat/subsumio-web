import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { bankFeedFromEnv } from "@/lib/fibu-bank-feed.server";
import { autoMatchTransaction, applyMatch, type OpenItem } from "@/lib/fibu";
import type { AuditAction } from "@/lib/audit";

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
      action: "fibu.bank_feed" as unknown as AuditAction,
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
    const params = new URLSearchParams({ type: "open_item", limit: "500" });
    const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = response.ok ? await response.json() : [];
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
      frontmatter: OpenItem;
    }>;
    let openItems = pages.map((page) => page.frontmatter);
    let matched = 0;
    for (const transaction of transactions) {
      const match = autoMatchTransaction(transaction, openItems);
      const result = match ? applyMatch(transaction, match, openItems) : { transaction, openItems };
      if (match) {
        matched++;
        // CRITICAL FIX: persist updated open items after match
        // Previously only the transaction was persisted, not the OPOS update
        for (const item of result.openItems) {
          const original = openItems.find((o) => o.id === item.id);
          if (
            original &&
            (item.status !== original.status ||
              item.paid_amount !== original.paid_amount ||
              item.open_amount !== original.open_amount)
          ) {
            await fetch(`${ENGINE_URL}/api/pages`, {
              method: "POST",
              headers: { ...ctx.headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                slug: `legal/open-items/${item.id}`,
                title: `OPOS: ${item.invoice_number} — ${item.client_name}`,
                type: "open_item",
                frontmatter: item,
              }),
              signal: AbortSignal.timeout(10_000),
            });
          }
        }
        // Update in-memory state so next transaction sees updated balances
        openItems = result.openItems;
      }
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/bank-transactions/${transaction.id}`,
          title: `Bankbuchung ${transaction.date}`,
          type: "bank_transaction",
          frontmatter: result.transaction,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }
    return apiSuccess({ provider: provider.name, imported: transactions.length, matched });
  }
);
