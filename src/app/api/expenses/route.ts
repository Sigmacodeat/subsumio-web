import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import type { ExpenseEntry } from "@/lib/legal-types";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  filterExpenses,
  computeExpenseSummary,
  createExpense,
  updateExpenseEntry,
  deleteExpenseEntry,
  writeExpensesWithRetry,
  listAllExpenses,
  ExpensesNotFoundError,
  ExpensesWriteConflictError,
  ExpenseBilledError,
  type ExpenseEntryWithCase,
} from "@/lib/expense-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/expenses");

export const dynamic = "force-dynamic";

const expenseWriteLog = {
  warn: (msg: string, ctx?: object) => log.warn(msg, ctx),
  error: (msg: string, ctx?: object) => log.error(msg, ctx),
};

/** Maps the lib's write errors to API responses — shared by PATCH/DELETE. */
function expenseWriteError(err: unknown): ReturnType<typeof apiError> | null {
  if (err instanceof ExpensesNotFoundError) {
    return apiError("expense_not_found", "Auslage nicht gefunden", 404);
  }
  if (err instanceof ExpenseBilledError) {
    return apiError(
      "expense_billed",
      "Die Auslage ist bereits abgerechnet — zuerst die Abrechnung zurücknehmen.",
      409
    );
  }
  if (err instanceof ExpensesWriteConflictError) {
    return apiError(
      "write_conflict",
      "Auslage konnte nicht gespeichert werden — bitte erneut versuchen.",
      409
    );
  }
  return null;
}

const expenseQuerySchema = z
  .object({
    caseSlug: z.string().optional(),
    case_slug: z.string().optional(),
    billable: z.string().optional(),
    unbilled: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.string().optional(),
  })
  .passthrough();

// Auslagen sind Geldbeträge — NaN/negative Werte würden die Abrechnung
// verfälschen; die Obergrenze fängt Client-Bugs ab, nicht reale Auslagen.
const AMOUNT_MAX = 100_000_000;

const amountField = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : parseFloat(String(v).trim().replace(",", "."))))
  .pipe(
    z
      .number()
      .finite("amount_invalid")
      .min(0, "amount_required_nonneg")
      .max(AMOUNT_MAX, "amount_max")
  );

// Akzeptiert "YYYY-MM-DD" und vollständige ISO-8601-Datumszeitangaben —
// Alt-Daten im Frontmatter tragen beide Formen.
const expenseDateField = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?)?)?$/,
    "date_required_iso"
  );

const currencyField = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "currency_required_iso4217")
  .transform((v) => v.toUpperCase());

const expensePostSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  description: z.string().min(1, "description_required").max(500),
  amount: amountField,
  date: expenseDateField,
  currency: currencyField.default("EUR"),
  vat_rate: z.number().min(0).max(100).optional(),
  billable: z.boolean().default(true),
  receipt_slug: z.string().max(300).optional(),
});

const expensePatchSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  id: z.string().min(1, "case_slug_and_id_required"),
  // `billed`/`invoice_number` fehlen absichtlich: Abrechnungsstatus ändert
  // sich nur über mark-billed/unbill, damit der Audit-Trail die
  // Rechnungsnummer behält und der Billed-Guard nicht umgehbar ist.
  description: z.string().min(1).max(500).optional(),
  amount: amountField.optional(),
  date: expenseDateField.optional(),
  currency: currencyField.optional(),
  vat_rate: z.number().min(0).max(100).optional(),
  billable: z.boolean().optional(),
  receipt_slug: z.string().max(300).optional(),
});

const expenseDeleteSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  id: z.string().min(1, "case_slug_and_id_required"),
});

export const GET = createHandler(
  {
    action: "expenses.read",
    rateTier: "standard",
    query: expenseQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    const brain = createServerBrainClient(ctx.headers);
    const caseSlug = query.caseSlug || query.case_slug || "";
    const rawLimit = parseInt(query.limit || "200", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;

    try {
      let entries: ExpenseEntryWithCase[] = [];

      if (caseSlug) {
        const casePage = await brain.getPage(caseSlug).catch(() => null);
        if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);
        const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
        const raw = Array.isArray(fm.expenses) ? (fm.expenses as ExpenseEntry[]) : [];
        entries = raw.map((e) => ({ ...e, case_slug: caseSlug }));
      } else {
        entries = await listAllExpenses(brain);
      }

      const filtered = filterExpenses(entries, {
        billable: query.billable === "true" ? true : query.billable === "false" ? false : undefined,
        unbilled: query.unbilled === "true",
        from: query.from || undefined,
        to: query.to || undefined,
      }).slice(0, limit);

      return apiSuccess({
        entries: filtered,
        total: filtered.length,
        summary: computeExpenseSummary(filtered),
      });
    } catch (err) {
      log.error("[expenses] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Auslagen konnten nicht geladen werden", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "expenses.create",
    rateTier: "standard",
    body: expensePostSchema,
    audit: (_ctx, body) => ({
      action: "expense.create" as const,
      entityType: "expense",
      entityId: body.case_slug,
      details: {
        amount: body.amount,
        currency: body.currency,
        billable: body.billable,
        description: body.description.slice(0, 80),
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const brain = createServerBrainClient(ctx.headers);
    const entry = createExpense({
      description: body.description,
      amount: Math.round(body.amount * 100) / 100,
      date: body.date,
      currency: body.currency,
      vat_rate: body.vat_rate,
      billable: body.billable,
      receipt_slug: body.receipt_slug,
    });

    const exists = await brain.getPage(body.case_slug).catch(() => null);
    if (!exists) return apiError("case_not_found", "Akte nicht gefunden", 404);

    try {
      await writeExpensesWithRetry(
        brain,
        body.case_slug,
        (freshEntries) => ({
          nextEntries: [...freshEntries, entry],
          meta: null,
        }),
        expenseWriteLog
      );
    } catch (err) {
      const mapped = expenseWriteError(err);
      if (mapped) return mapped;
      throw err;
    }

    broadcastSseEvent(ctx.brainId, "expense.created", {
      case_slug: body.case_slug,
      expense_id: entry.id,
    });

    return apiSuccess({ entry, case_slug: body.case_slug }, undefined, 201);
  }
);

export const PATCH = createHandler(
  {
    action: "expenses.update",
    rateTier: "standard",
    body: expensePatchSchema,
    audit: (_ctx, body) => ({
      action: "expense.update" as const,
      entityType: "expense",
      entityId: body.id,
      details: { case_slug: body.case_slug },
    }),
  },
  async (ctx, body, _query, _req) => {
    const brain = createServerBrainClient(ctx.headers);

    const exists = await brain.getPage(body.case_slug).catch(() => null);
    if (!exists) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const allowedUpdates: Partial<ExpenseEntry> = {};
    const allowed = [
      "description",
      "amount",
      "date",
      "currency",
      "vat_rate",
      "billable",
      "receipt_slug",
    ] as const;
    for (const key of allowed) {
      const value = body[key];
      if (value !== undefined) {
        (allowedUpdates as Record<string, unknown>)[key] =
          key === "amount" ? Math.round((value as number) * 100) / 100 : value;
      }
    }

    let updated: ExpenseEntry;
    try {
      const { meta } = await writeExpensesWithRetry<ExpenseEntry>(
        brain,
        body.case_slug,
        (freshEntries) => {
          const result = updateExpenseEntry(freshEntries, body.id, allowedUpdates);
          if (result.billed) return { billed: true };
          if (!result.found || !result.updated) return { notFound: true };
          const meta: ExpenseEntry = result.updated;
          return { nextEntries: result.entries, meta };
        },
        expenseWriteLog
      );
      updated = meta;
    } catch (err) {
      const mapped = expenseWriteError(err);
      if (mapped) return mapped;
      throw err;
    }

    broadcastSseEvent(ctx.brainId, "expense.updated", {
      case_slug: body.case_slug,
      expense_id: body.id,
    });

    return apiSuccess({ entry: updated });
  }
);

export const DELETE = createHandler(
  {
    action: "expenses.delete",
    rateTier: "standard",
    body: expenseDeleteSchema,
    audit: (_ctx, body) => ({
      action: "expense.delete" as const,
      entityType: "expense",
      entityId: body.id,
      details: { case_slug: body.case_slug },
    }),
  },
  async (ctx, body, _query, _req) => {
    const brain = createServerBrainClient(ctx.headers);

    const exists = await brain.getPage(body.case_slug).catch(() => null);
    if (!exists) return apiError("case_not_found", "Akte nicht gefunden", 404);

    try {
      await writeExpensesWithRetry(
        brain,
        body.case_slug,
        (freshEntries) => {
          const result = deleteExpenseEntry(freshEntries, body.id);
          if (result.billed) return { billed: true };
          if (!result.found) return { notFound: true };
          return { nextEntries: result.entries, meta: null };
        },
        expenseWriteLog
      );
    } catch (err) {
      const mapped = expenseWriteError(err);
      if (mapped) return mapped;
      throw err;
    }

    broadcastSseEvent(ctx.brainId, "expense.deleted", {
      case_slug: body.case_slug,
      expense_id: body.id,
    });

    return apiSuccess({ ok: true });
  }
);
