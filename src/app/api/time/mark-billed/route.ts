import { z } from "zod";
import { api } from "@/lib/api";
import type { TimeEntry } from "@/lib/legal-types";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/app/api/realtime/sse/route";
import {
  markEntriesBilled,
  type TimeEntryWithCase,
} from "@/lib/time-tracking";

export const dynamic = "force-dynamic";

const markBilledSchema = z.object({
  entry_ids: z.array(z.string().min(1)).min(1, "entry_ids_required"),
  invoice_number: z.string().min(1, "invoice_number_required"),
  case_slug: z.string().min(1, "case_slug_required"),
});

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: markBilledSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "time_entry",
      entityId: body.case_slug,
      details: { invoice_number: body.invoice_number, count: body.entry_ids.length },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const casePage = await api.brain.getPage(body.case_slug).catch(() => null);
      if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

      const fm = casePage.frontmatter as Record<string, unknown>;
      const entries = Array.isArray(fm.time_entries) ? fm.time_entries as TimeEntry[] : [];

      const entriesWithCase: TimeEntryWithCase[] = entries.map((e) => ({ ...e, case_slug: body.case_slug }));
      const result = markEntriesBilled(entriesWithCase, body.entry_ids, body.invoice_number);

      if (result.updated === 0) {
        return apiError("time_entry_not_found", "Keine der angegebenen Zeiteinträge gefunden", 404);
      }

      const updatedEntries = result.entries.map(({ case_slug: _cs, ...e }) => e);
      await api.brain.updatePage({
        slug: body.case_slug,
        frontmatter: { ...fm, time_entries: updatedEntries },
      });

      broadcastSseEvent(ctx.brainId, "time.entry.billed", {
        case_slug: body.case_slug,
        invoice_number: body.invoice_number,
        updated_count: result.updated,
      });

      return apiSuccess({
        updated: result.updated,
        not_found: result.not_found,
        invoice_number: body.invoice_number,
      });
    } catch (err) {
      console.error("[time] mark-billed failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Einträge konnten nicht als abgerechnet markiert werden", 500);
    }
  },
);
