import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import type { TimeEntry } from "@/lib/legal-types";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { unbillEntries, type TimeEntryWithCase } from "@/lib/time-tracking";

export const dynamic = "force-dynamic";

const unbillSchema = z.object({
  entry_ids: z.array(z.string().min(1)).min(1, "entry_ids_required"),
  case_slug: z.string().min(1, "case_slug_required"),
});

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: unbillSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "time_entry",
      entityId: body.case_slug,
      details: { unbill: true, count: body.entry_ids.length },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const brain = createServerBrainClient(ctx.headers);
      const casePage = await brain.getPage(body.case_slug).catch(() => null);
      if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

      const fm = casePage.frontmatter as Record<string, unknown>;
      const entries = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];

      const entriesWithCase: TimeEntryWithCase[] = entries.map((e) => ({
        ...e,
        case_slug: body.case_slug,
      }));
      const result = unbillEntries(entriesWithCase, body.entry_ids);

      if (result.updated === 0) {
        return apiError("time_entry_not_found", "Keine der angegebenen Zeiteinträge gefunden", 404);
      }

      const updatedEntries = result.entries.map(({ case_slug: _cs, ...e }) => e);
      await brain.updatePage({
        slug: body.case_slug,
        frontmatter: { ...fm, time_entries: updatedEntries },
      });

      broadcastSseEvent(ctx.brainId, "time.entry.unbilled", {
        case_slug: body.case_slug,
        updated_count: result.updated,
      });

      return apiSuccess({
        updated: result.updated,
        not_found: result.not_found,
      });
    } catch (err) {
      console.error("[time] unbill failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Abrechnung konnte nicht zurückgenommen werden", 500);
    }
  }
);
