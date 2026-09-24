import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  filterEntries,
  computeBillingSummary,
  listAllTimeEntries,
} from "@/lib/time-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/time/billing-summary");

export const dynamic = "force-dynamic";

const billingSummarySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  lawyer: z.string().optional(),
  default_rate: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    query: billingSummarySchema,
  },
  async (ctx, _body, query, _req) => {
    try {
      const brain = createServerBrainClient(ctx.headers);
      // Same merged source as /api/time: standalone time_entry pages AND the
      // per-matter time_entries arrays — otherwise the summary undercounts
      // everything booked inside a matter (and used to cap at 500 pages).
      const entries = await listAllTimeEntries(brain);

      const filtered = filterEntries(entries, {
        from: query.from || undefined,
        to: query.to || undefined,
        lawyer: query.lawyer || undefined,
      });

      const defaultRate = query.default_rate ? parseFloat(query.default_rate) : undefined;
      const summary = computeBillingSummary(filtered, defaultRate);

      return apiSuccess(summary);
    } catch (err) {
      log.error("[time] billing-summary failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Billing-Summary konnte nicht geladen werden", 500);
    }
  }
);
