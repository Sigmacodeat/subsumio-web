import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listOpenItems } from "@/lib/open-items";
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
        date: z.string().max(20),
        amount: z.number(),
        direction: z.enum(["debit", "credit"]),
        iban: z.string().max(34),
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
    action: "invoice.write",
    rateTier: "standard",
    body: importBankSchema,
    audit: (_ctx, body) => ({
      action: "fibu.opos_import" as const,
      entityType: "bank_transaction",
      details: { count: body.transactions.length },
    }),
  },
  async (ctx, body) => {
    // 1. Load existing open items for matching — paginiert (die Engine kappt
    //    Einzelrequests auf 100; ein größerer `limit` würde OPs still
    //    überspringen und Fehl-Matchings erzeugen).
    let openItems: OpenItem[];
    try {
      openItems = await listOpenItems(ctx.headers);
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }

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

        // CRITICAL FIX: persist ALL updated open items, not just status changes.
        // Previously only `item.status !== original.status` was checked, which
        // meant partial payments (paid_amount/open_amount change, status stays "open")
        // were never persisted to the DB.
        for (const item of updatedItems) {
          const original = openItems.find((o) => o.id === item.id);
          if (
            original &&
            (item.status !== original.status ||
              item.paid_amount !== original.paid_amount ||
              item.open_amount !== original.open_amount ||
              item.dunning_fee !== original.dunning_fee)
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

        // HIGH FIX: update in-memory state so the next transaction
        // in this batch sees the updated balances (prevents stale matching)
        openItems = updatedItems;
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
    audit: (_ctx, _body, query) => ({
      action: "fibu.opos_list" as const,
      entityType: "open_item",
      details: { status: query?.status },
    }),
  },
  async (ctx, _body, query) => {
    // listEnginePages liefert Page-Objekte — die OpenItem-Felder liegen im
    // frontmatter, nicht auf der Page selbst.
    let items: OpenItem[];
    try {
      items = await listOpenItems(ctx.headers);
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }

    if (query?.status) {
      items = items.filter((i) => i.status === query.status);
    }

    const summary = getOposSummary(items);

    return apiSuccess({ items, summary });
  }
);
