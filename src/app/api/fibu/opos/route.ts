import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createBankTransaction,
  autoMatchTransaction,
  applyMatch,
  getOposSummary,
  type BankTransaction,
  type OpenItem,
} from "@/lib/fibu";

// ── Import Bank Transactions ──────────────────────────────────────────

const importBankSchema = z.object({
  transactions: z
    .array(
      z.object({
        date: z.string(),
        amount: z.number(),
        direction: z.enum(["debit", "credit"]),
        iban: z.string(),
        bic: z.string().optional(),
        sender_name: z.string().optional(),
        sender_iban: z.string().optional(),
        reference: z.string().optional(),
        purpose: z.string().optional(),
      })
    )
    .min(1)
    .max(100),
});

export const POST = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    body: importBankSchema,
  },
  async (ctx, body) => {
    // 1. Load existing open items for matching
    const params = new URLSearchParams({ type: "open_item", limit: "500" });
    const listRes = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!listRes.ok) return apiError("engine_error", "Engine request failed", 502);
    const listData = await listRes.json();
    const pages = (Array.isArray(listData) ? listData : (listData.pages ?? [])) as Array<{
      frontmatter: Record<string, unknown>;
    }>;
    const openItems: OpenItem[] = pages.map((p) => p.frontmatter as unknown as OpenItem);

    const results: Array<{
      transaction: BankTransaction;
      match: ReturnType<typeof autoMatchTransaction>;
    }> = [];

    for (const input of body.transactions) {
      const txn = createBankTransaction(input);
      const match = autoMatchTransaction(txn, openItems);

      if (match) {
        const { transaction: matchedTxn, openItems: updatedItems } = applyMatch(
          txn,
          match,
          openItems
        );
        results.push({ transaction: matchedTxn, match });

        // Persist updated open items
        for (const item of updatedItems) {
          const original = openItems.find((o) => o.id === item.id);
          if (original && item.status !== original.status) {
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
      } else {
        results.push({ transaction: txn, match: null });
      }

      // Persist transaction
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/bank-transactions/${txn.id}`,
          title: `${txn.date} ${txn.amount.toFixed(2)}€ ${txn.sender_name ?? ""}`,
          type: "bank_transaction",
          frontmatter: results[results.length - 1]!.transaction,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }

    return apiSuccess({
      imported: results.length,
      matched: results.filter((r) => r.match !== null).length,
      unmatched: results.filter((r) => r.match === null).length,
      results,
    });
  }
);

// ── List OPOS ─────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  status: z.enum(["open", "reminded", "overdue", "paid", "written_off"]).optional(),
});

export const GET = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    query: listQuerySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "open_item", limit: "200" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: OpenItem[] = (Array.isArray(data) ? data : (data.pages ?? [])) as OpenItem[];

    if (query?.status) {
      items = items.filter((i) => i.status === query.status);
    }

    const summary = getOposSummary(items);

    return apiSuccess({ items, summary });
  }
);
