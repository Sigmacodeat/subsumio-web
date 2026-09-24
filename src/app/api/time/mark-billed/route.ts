import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  markEntriesBilled,
  updateStandaloneBilling,
  writeTimeEntriesWithRetry,
  STANDALONE_ENTRY_PREFIX,
  TimeEntriesWriteConflictError,
  type TimeEntryWithCase,
} from "@/lib/time-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/time/mark-billed");

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
      const brain = createServerBrainClient(ctx.headers);
      // Standalone `time_entry` pages (timer stops, imports) live outside
      // the matter's time_entries array — bill them on their own pages.
      const standaloneIds = body.entry_ids.filter((id) => id.startsWith(STANDALONE_ENTRY_PREFIX));
      const caseIds = body.entry_ids.filter((id) => !id.startsWith(STANDALONE_ENTRY_PREFIX));

      let result: { updated: number; not_found: string[]; already_billed?: string[] } = {
        updated: 0,
        not_found: [],
      };
      if (caseIds.length > 0) {
        const casePage = await brain.getPage(body.case_slug).catch(() => null);
        if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

        const { meta } = await writeTimeEntriesWithRetry(
          brain,
          body.case_slug,
          (freshEntries) => {
            const entriesWithCase: TimeEntryWithCase[] = freshEntries.map((e) => ({
              ...e,
              case_slug: body.case_slug,
            }));
            const r = markEntriesBilled(entriesWithCase, caseIds, body.invoice_number);
            return {
              nextEntries: r.entries.map(({ case_slug: _cs, ...e }) => e),
              meta: r,
            };
          },
          log
        );
        result = meta;
      }

      let alreadyBilled: string[] = result.already_billed ?? [];
      if (standaloneIds.length > 0) {
        const standalone = await updateStandaloneBilling(brain, standaloneIds, {
          billed: true,
          invoiceNumber: body.invoice_number,
        });
        result = {
          updated: result.updated + standalone.updated,
          not_found: [...result.not_found, ...standalone.not_found],
        };
        alreadyBilled = [...alreadyBilled, ...standalone.already_billed];
      }

      if (result.updated === 0) {
        return apiError("time_entry_not_found", "Keine der angegebenen Zeiteinträge gefunden", 404);
      }

      broadcastSseEvent(ctx.brainId, "time.entry.billed", {
        case_slug: body.case_slug,
        invoice_number: body.invoice_number,
        updated_count: result.updated,
      });

      return apiSuccess({
        updated: result.updated,
        not_found: result.not_found,
        already_billed: alreadyBilled,
        invoice_number: body.invoice_number,
      });
    } catch (err) {
      if (err instanceof TimeEntriesWriteConflictError) {
        return apiError(
          "write_conflict",
          "Einträge konnten nicht als abgerechnet markiert werden — bitte erneut versuchen.",
          409
        );
      }
      log.error("[time] mark-billed failed:", err instanceof Error ? err.message : String(err));
      return apiError(
        "internal_error",
        "Einträge konnten nicht als abgerechnet markiert werden",
        500
      );
    }
  }
);
