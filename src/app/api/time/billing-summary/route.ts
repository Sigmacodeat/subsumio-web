import { z } from "zod";
import { api } from "@/lib/api";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  filterEntries,
  computeBillingSummary,
  type TimeEntryWithCase,
} from "@/lib/time-tracking";

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
  async (_ctx, _body, query, _req) => {
    try {
      const pages = await api.brain.listPages({ type: "time_entry", limit: 500 });
      const entries: TimeEntryWithCase[] = pages.map((p) => {
        const fm = p.frontmatter as Record<string, unknown>;
        return {
          id: p.slug,
          description: String(fm.description ?? ""),
          minutes: Number(fm.minutes ?? 0),
          date: String(fm.date ?? ""),
          rate: fm.rate ? Number(fm.rate) : undefined,
          billable: Boolean(fm.billable),
          billed: Boolean(fm.billed),
          invoice_number: fm.invoice_number ? String(fm.invoice_number) : undefined,
          lawyer: fm.lawyer ? String(fm.lawyer) : undefined,
          activity_type: fm.activity_type ? String(fm.activity_type) : undefined,
          case_slug: fm.case_slug ? String(fm.case_slug) : undefined,
        };
      });

      const filtered = filterEntries(entries, {
        from: query.from || undefined,
        to: query.to || undefined,
        lawyer: query.lawyer || undefined,
      });

      const defaultRate = query.default_rate ? parseFloat(query.default_rate) : undefined;
      const summary = computeBillingSummary(filtered, defaultRate);

      return apiSuccess(summary);
    } catch (err) {
      console.error("[time] billing-summary failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Billing-Summary konnte nicht geladen werden", 500);
    }
  },
);
