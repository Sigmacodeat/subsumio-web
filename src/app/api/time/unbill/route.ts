import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  unbillTimeEntries,
  updateStandaloneBilling,
  STANDALONE_ENTRY_PREFIX,
} from "@/lib/time-tracking";
import { findUnbillBlockers, unbillBlockedResponse } from "@/lib/invoice-billing-lock";
import { GUARD_READ_FAILED, rejectionResponse } from "@/lib/page-write-guards";

import { logger } from "@/lib/logger";
const log = logger("api/time/unbill");

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
      const standaloneIds = body.entry_ids.filter((id) => id.startsWith(STANDALONE_ENTRY_PREFIX));
      const caseIds = body.entry_ids.filter((id) => !id.startsWith(STANDALONE_ENTRY_PREFIX));

      // Which invoice does each entry sit on? Work on an issued invoice that
      // is neither stornoed nor deleted stays billed (409) — otherwise it
      // would be billed a second time.
      const refs: Array<{ id: string; invoice_number?: unknown }> = [];
      if (caseIds.length > 0) {
        const casePage = await brain.getPage(body.case_slug).catch(() => null);
        if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);
        const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
        const list = Array.isArray(fm.time_entries)
          ? (fm.time_entries as Array<Record<string, unknown>>)
          : [];
        for (const e of list) {
          if (e && caseIds.includes(String(e.id))) {
            refs.push({ id: String(e.id), invoice_number: e.invoice_number });
          }
        }
      }
      for (const id of standaloneIds) {
        const page = await brain.getPage(id).catch(() => null);
        const fm = (page?.frontmatter ?? null) as Record<string, unknown> | null;
        if (fm) refs.push({ id, invoice_number: fm.invoice_number });
      }
      let blockers;
      try {
        blockers = await findUnbillBlockers(ctx.headers, refs);
      } catch {
        return rejectionResponse(GUARD_READ_FAILED);
      }
      if (blockers.length > 0) return unbillBlockedResponse(blockers);

      // Unbill per invoice number: an entry that moved to another invoice
      // since the check above is skipped inside the same UPDATE.
      const numberOf = new Map(refs.map((r) => [r.id, String(r.invoice_number ?? "")]));
      let result: { updated: number; not_found: string[] } = { updated: 0, not_found: [] };
      if (caseIds.length > 0) {
        const groups = new Map<string, string[]>();
        for (const id of caseIds) {
          const n = numberOf.get(id) ?? "";
          groups.set(n, [...(groups.get(n) ?? []), id]);
        }
        const notFound = new Set<string>();
        for (const [number, ids] of groups) {
          // Atomic single-statement update — clears billed + invoice_number.
          const r = await unbillTimeEntries(brain, body.case_slug, ids, number);
          result.updated += r.updated;
          for (const id of r.not_found) notFound.add(id);
        }
        result.not_found = [...notFound];
      }

      if (standaloneIds.length > 0) {
        const standalone = await updateStandaloneBilling(brain, standaloneIds, {
          billed: false,
        });
        result = {
          updated: result.updated + standalone.updated,
          not_found: [...result.not_found, ...standalone.not_found],
        };
      }

      if (result.updated === 0) {
        return apiError("time_entry_not_found", "Keine der angegebenen Zeiteinträge gefunden", 404);
      }

      broadcastSseEvent(ctx.brainId, "time.entry.unbilled", {
        case_slug: body.case_slug,
        updated_count: result.updated,
      });

      return apiSuccess({
        updated: result.updated,
        not_found: result.not_found,
      });
    } catch (err) {
      log.error("[time] unbill failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Abrechnung konnte nicht zurückgenommen werden", 500);
    }
  }
);
