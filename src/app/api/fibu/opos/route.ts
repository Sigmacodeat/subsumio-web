import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listOpenItems } from "@/lib/open-items";
import { engineWriteOrThrow } from "@/lib/engine-write";
import {
  bankTransactionExists,
  bankTransactionSlug,
  changedOpenItems,
} from "@/lib/fibu-import.server";
import {
  createBankTransaction,
  withBatchOccurrenceIds,
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
    let skipped = 0;

    // Content-derived ids: re-importing the same statement is recognised and
    // skipped instead of applying the payments a second time.
    const transactions = withBatchOccurrenceIds(body.transactions.map(createBankTransaction));

    for (const txn of transactions) {
      if (await bankTransactionExists(ctx.headers, txn.id)) {
        skipped++;
        continue;
      }
      const match = autoMatchTransaction(txn, openItems);
      let stored: BankTransaction = txn;

      if (match) {
        const { transaction: matchedTxn, openItems: updatedItems } = applyMatch(
          txn,
          match,
          openItems
        );
        stored = matchedTxn;

        // Persist every changed open item (partial payments change the
        // balance but not the status). A refused write aborts the import
        // before the transaction is stored, so a retry picks it up again.
        for (const item of changedOpenItems(openItems, updatedItems)) {
          await engineWriteOrThrow(
            `${ENGINE_URL}/api/pages`,
            {
              method: "POST",
              headers: { ...ctx.headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                slug: `legal/open-items/${item.id}`,
                title: `OPOS: ${item.invoice_number} — ${item.client_name}`,
                type: "open_item",
                frontmatter: item,
              }),
              signal: AbortSignal.timeout(10_000),
            },
            "Offener Posten"
          );
        }

        // Next transaction in this batch sees the updated balances.
        openItems = updatedItems;
      }

      await engineWriteOrThrow(
        `${ENGINE_URL}/api/pages`,
        {
          method: "POST",
          headers: { ...ctx.headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: bankTransactionSlug(txn.id),
            title: `${txn.date} ${txn.amount.toFixed(2)}€ ${txn.sender_name ?? ""}`,
            type: "bank_transaction",
            frontmatter: stored,
          }),
          signal: AbortSignal.timeout(10_000),
        },
        "Banktransaktion"
      );
      results.push({ transaction: stored, match });
    }

    return apiSuccess({
      imported: results.length,
      skipped,
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
