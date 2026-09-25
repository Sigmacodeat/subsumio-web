import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { listOpenItems } from "@/lib/open-items";
import { importAndMatchTransactions } from "@/lib/fibu-import.server";
import { createBankTransaction, getOposSummary, withOccurrence, type OpenItem } from "@/lib/fibu";

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
    // Deterministic booking ids + create-only claim in the shared import
    // path: entering the same booking twice does not pay the open item twice.
    const transactions = withOccurrence(body.transactions).map(({ input, occurrence }) =>
      createBankTransaction(input, { occurrence })
    );
    let result;
    try {
      result = await importAndMatchTransactions(ctx.headers, transactions, {
        brainId: ctx.brainId,
      });
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    return apiSuccess({
      imported: result.imported,
      matched: result.matched,
      unmatched: result.imported - result.matched,
      duplicates: result.duplicates,
      errors: result.errors,
      invoicesPaid: result.invoicesPaid,
      results: result.results,
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
