import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { unbillExpensesAtomic } from "@/lib/expense-tracking";
import { findUnbillBlockers, unbillBlockedResponse } from "@/lib/invoice-billing-lock";
import { GUARD_READ_FAILED, rejectionResponse } from "@/lib/page-write-guards";

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

      // Auslagen auf einer ausgestellten, weder stornierten noch gelöschten
      // Rechnung bleiben abgerechnet (409) — sonst würden sie doppelt verrechnet.
      const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
      const list = Array.isArray(fm.expenses)
        ? (fm.expenses as Array<Record<string, unknown>>)
        : [];
      const refs = list
        .filter((e) => e && body.entry_ids.includes(String(e.id)))
        .map((e) => ({ id: String(e.id), invoice_number: e.invoice_number }));
      let blockers;
      try {
        blockers = await findUnbillBlockers(ctx.headers, refs);
      } catch {
        return rejectionResponse(GUARD_READ_FAILED);
      }
      if (blockers.length > 0) return unbillBlockedResponse(blockers);

      // Atomic single-statement update (billed=false, invoice_number removed),
      // per invoice number: an expense moved to another invoice since the
      // check above is skipped inside the same UPDATE.
      const numberOf = new Map(refs.map((r) => [r.id, String(r.invoice_number ?? "")]));
      const groups = new Map<string, string[]>();
      for (const id of body.entry_ids) {
        const n = numberOf.get(id) ?? "";
        groups.set(n, [...(groups.get(n) ?? []), id]);
      }
      const meta = { updated: 0, not_found: [] as string[] };
      for (const [number, ids] of groups) {
        const r = await unbillExpensesAtomic(brain, body.case_slug, ids, number);
        meta.updated += r.updated;
        meta.not_found.push(...r.not_found);
      }

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
      log.error("[expenses] unbill failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Abrechnung konnte nicht zurückgenommen werden", 500);
    }
  }
);
