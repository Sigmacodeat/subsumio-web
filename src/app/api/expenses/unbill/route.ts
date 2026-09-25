import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  unbillExpenses,
  writeExpensesWithRetry,
  ExpensesWriteConflictError,
  type ExpenseEntryWithCase,
} from "@/lib/expense-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/expenses/unbill");

export const dynamic = "force-dynamic";

const unbillSchema = z.object({
  entry_ids: z.array(z.string().min(1)).min(1, "entry_ids_required"),
  case_slug: z.string().min(1, "case_slug_required"),
});

export const POST = createHandler(
  {
    action: "expenses.update",
    rateTier: "standard",
    body: unbillSchema,
    audit: (_ctx, body) => ({
      action: "expense.unbill" as const,
      entityType: "expense",
      entityId: body.case_slug,
      details: { unbill: true, count: body.entry_ids.length },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const brain = createServerBrainClient(ctx.headers);
      const casePage = await brain.getPage(body.case_slug).catch(() => null);
      if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

      const { meta } = await writeExpensesWithRetry(
        brain,
        body.case_slug,
        (freshEntries) => {
          const entriesWithCase: ExpenseEntryWithCase[] = freshEntries.map((e) => ({
            ...e,
            case_slug: body.case_slug,
          }));
          const r = unbillExpenses(entriesWithCase, body.entry_ids);
          return {
            nextEntries: r.entries.map(({ case_slug: _cs, ...e }) => e),
            meta: r,
          };
        },
        log
      );

      if (meta.updated === 0) {
        return apiError("expense_not_found", "Keine der angegebenen Auslagen gefunden", 404);
      }

      broadcastSseEvent(ctx.brainId, "expense.unbilled", {
        case_slug: body.case_slug,
        updated_count: meta.updated,
      });

      return apiSuccess({
        updated: meta.updated,
        not_found: meta.not_found,
      });
    } catch (err) {
      if (err instanceof ExpensesWriteConflictError) {
        return apiError(
          "write_conflict",
          "Abrechnung konnte nicht zurückgenommen werden — bitte erneut versuchen.",
          409
        );
      }
      log.error("[expenses] unbill failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Abrechnung konnte nicht zurückgenommen werden", 500);
    }
  }
);
