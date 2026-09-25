import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { markExpensesBilledAtomic } from "@/lib/expense-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/expenses/mark-billed");

export const dynamic = "force-dynamic";

const markBilledSchema = z.object({
  entry_ids: z.array(z.string().min(1)).min(1, "entry_ids_required"),
  invoice_number: z.string().min(1, "invoice_number_required"),
  case_slug: z.string().min(1, "case_slug_required"),
});

export const POST = createHandler(
  {
    action: "expenses.update",
    rateTier: "standard",
    body: markBilledSchema,
    audit: (_ctx, body) => ({
      action: "expense.mark_billed" as const,
      entityType: "expense",
      entityId: body.case_slug,
      details: { invoice_number: body.invoice_number, count: body.entry_ids.length },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const brain = createServerBrainClient(ctx.headers);
      const casePage = await brain.getPage(body.case_slug).catch(() => null);
      if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

      // Atomic single-statement update — the "already billed under a
      // different invoice" skip runs inside the engine (unless guard), so two
      // invoices drafted in parallel can never double-bill an expense the
      // other one just claimed.
      const meta = await markExpensesBilledAtomic(
        brain,
        body.case_slug,
        body.entry_ids,
        body.invoice_number
      );

      // Only "nothing matched at all" is a 404. "All already billed under
      // another invoice" is a 200 with updated=0 + already_billed — the
      // invoice dialog has to see WHICH ids it may not claim.
      if (meta.not_found.length === body.entry_ids.length) {
        return apiError("expense_not_found", "Keine der angegebenen Auslagen gefunden", 404);
      }

      if (meta.updated > 0) {
        broadcastSseEvent(ctx.brainId, "expense.billed", {
          case_slug: body.case_slug,
          invoice_number: body.invoice_number,
          updated_count: meta.updated,
        });
      }

      return apiSuccess({
        updated: meta.updated,
        not_found: meta.not_found,
        already_billed: meta.already_billed,
        invoice_number: body.invoice_number,
      });
    } catch (err) {
      log.error("[expenses] mark-billed failed:", err instanceof Error ? err.message : String(err));
      return apiError(
        "internal_error",
        "Auslagen konnten nicht als abgerechnet markiert werden",
        500
      );
    }
  }
);
