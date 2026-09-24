import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import type { TimeEntry } from "@/lib/legal-types";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  filterEntries,
  computeSummary,
  computeBillingSummary,
  markEntriesBilled,
  createTimeEntry,
  updateEntry,
  deleteEntry,
  writeTimeEntriesWithRetry,
  listAllTimeEntries,
  standaloneEntryFromPage,
  updateStandaloneBilling,
  STANDALONE_ENTRY_PREFIX,
  TimeEntriesNotFoundError,
  TimeEntriesWriteConflictError,
  TimeEntryBilledError,
  type TimeEntryWithCase,
} from "@/lib/time-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/time");

export const dynamic = "force-dynamic";

const timeEntryWriteLog = {
  warn: (msg: string, ctx?: object) => log.warn(msg, ctx),
  error: (msg: string, ctx?: object) => log.error(msg, ctx),
};

/** Maps the lib's write errors to API responses — shared by PATCH/DELETE. */
function timeEntryWriteError(err: unknown): ReturnType<typeof apiError> | null {
  if (err instanceof TimeEntriesNotFoundError) {
    return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);
  }
  if (err instanceof TimeEntryBilledError) {
    return apiError(
      "time_entry_billed",
      "Der Eintrag ist bereits abgerechnet — zuerst die Abrechnung zurücknehmen.",
      409
    );
  }
  if (err instanceof TimeEntriesWriteConflictError) {
    return apiError(
      "write_conflict",
      "Zeiteintrag konnte nicht gespeichert werden — bitte erneut versuchen.",
      409
    );
  }
  return null;
}

const timeQuerySchema = z
  .object({
    caseSlug: z.string().optional(),
    case_slug: z.string().optional(),
    billable: z.string().optional(),
    unbilled: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    lawyer: z.string().optional(),
    limit: z.string().optional(),
    billing_summary: z.string().optional(),
  })
  .passthrough();

// A time entry is booked against ONE calendar day — 1440 minutes is the
// physical maximum, anything beyond is a client bug or abuse.
const MINUTES_MAX = 24 * 60;

const minutesField = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? Math.round(v) : parseInt(String(v), 10)))
  .pipe(z.number().int().positive("minutes_required_positive").max(MINUTES_MAX, "minutes_max"));

const activityTypeField = z.enum([
  "research",
  "drafting",
  "court",
  "meeting",
  "correspondence",
  "other",
]);

const timePostSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  description: z.string().min(1, "description_required").max(500),
  minutes: minutesField,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_required_iso"),
  rate: z.number().min(0).optional(),
  billable: z.boolean().default(true),
  activity_type: activityTypeField.default("other"),
  lawyer: z.string().max(100).optional(),
});

// The UI sends `case_slug: entry.case_slug || ""` — standalone entries
// carry no case_slug, so normalize empty/blank to absent instead of
// rejecting the edit of a timer entry.
const optionalCaseSlug = z
  .string()
  .max(300)
  .optional()
  .transform((v) => v?.trim() || undefined);

const timePatchSchema = z.object({
  // Optional because standalone entries (id `time-entries/…`) are not bound
  // to a matter — the handler requires it for the matter-array paths.
  case_slug: optionalCaseSlug,
  id: z.string().min(1, "case_slug_and_id_required"),
  mark_billed: z.boolean().optional(),
  entry_ids: z.array(z.string().min(1)).optional(),
  invoice_number: z.string().min(1).optional(),
  approval_status: z.enum(["pending", "approved", "rejected"]).optional(),
  // Editable fields — previously passed through .passthrough() unvalidated,
  // so `minutes: "abc"` or `rate: -1` landed raw in the matter's
  // time_entries and corrupted the billing summary.
  description: z.string().min(1).max(500).optional(),
  minutes: minutesField.optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_required_iso")
    .optional(),
  rate: z.number().min(0).optional(),
  billable: z.boolean().optional(),
  lawyer: z.string().max(100).optional(),
  activity_type: activityTypeField.optional(),
});

const timeDeleteSchema = z.object({
  case_slug: optionalCaseSlug,
  id: z.string().min(1, "case_slug_and_id_required"),
});

export const GET = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
    query: timeQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    const brain = createServerBrainClient(ctx.headers);
    const caseSlug = query.caseSlug || query.case_slug || "";
    const from = query.from || undefined;
    const to = query.to || undefined;
    const lawyerFilter = query.lawyer || undefined;
    const rawLimit = parseInt(query.limit || "200", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;
    const wantBillingSummary = query.billing_summary === "true";

    try {
      let entries: TimeEntryWithCase[] = [];

      if (caseSlug) {
        const casePage = await brain.getPage(caseSlug).catch(() => null);
        if (casePage) {
          const fm = casePage.frontmatter as Record<string, unknown>;
          const raw = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];
          entries = raw.map((e) => ({ ...e, case_slug: caseSlug }));
        }
      } else {
        // Time lives in two places: the `time_entries` list of each matter
        // and standalone `time_entry` pages (timer, imports). Shared helper
        // keeps this identical to /api/time/billing-summary.
        entries = await listAllTimeEntries(brain);
      }

      const filtered = filterEntries(entries, {
        billable: query.billable === "true" ? true : query.billable === "false" ? false : undefined,
        unbilled: query.unbilled === "true",
        from,
        to,
        lawyer: lawyerFilter,
      }).slice(0, limit);

      const summary = computeSummary(filtered);

      if (wantBillingSummary) {
        const billingSummary = computeBillingSummary(filtered);
        return apiSuccess({
          entries: filtered,
          total: filtered.length,
          summary,
          billing: billingSummary,
        });
      }

      return apiSuccess({ entries: filtered, total: filtered.length, summary });
    } catch (err) {
      log.error("[time] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Zeiterfassung konnte nicht geladen werden", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: timePostSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "time_entry",
      entityId: body.case_slug,
      details: {
        minutes: body.minutes,
        billable: body.billable,
        description: body.description.slice(0, 80),
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const brain = createServerBrainClient(ctx.headers);
    const entry = createTimeEntry({
      description: body.description,
      minutes: body.minutes,
      date: body.date,
      rate: body.rate,
      billable: body.billable,
      lawyer: body.lawyer || ctx.user?.name || ctx.user?.email,
      activity_type: body.activity_type,
    });

    const exists = await brain.getPage(body.case_slug).catch(() => null);
    if (!exists) return apiError("case_not_found", "Akte nicht gefunden", 404);

    try {
      await writeTimeEntriesWithRetry(
        brain,
        body.case_slug,
        (freshEntries) => ({
          nextEntries: [...freshEntries, entry],
          meta: null,
        }),
        timeEntryWriteLog
      );
    } catch (err) {
      const mapped = timeEntryWriteError(err);
      if (mapped) return mapped;
      throw err;
    }

    broadcastSseEvent(ctx.brainId, "time.entry.created", {
      case_slug: body.case_slug,
      entry_id: entry.id,
    });

    return apiSuccess({ entry, case_slug: body.case_slug }, undefined, 201);
  }
);

export const PATCH = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: timePatchSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "time_entry",
      entityId: body.id,
    }),
  },
  async (ctx, body, _query, _req) => {
    const brain = createServerBrainClient(ctx.headers);
    // Standalone `time_entry` pages (timer stops, imports): the id IS the
    // page slug and the entry is not bound to a matter's array.
    const standalone = body.id.startsWith(STANDALONE_ENTRY_PREFIX);
    if (!standalone) {
      if (!body.case_slug) {
        return apiError("case_slug_and_id_required", "case_slug und id erforderlich", 400);
      }
      const exists = await brain.getPage(body.case_slug).catch(() => null);
      if (!exists) return apiError("case_not_found", "Akte nicht gefunden", 404);
    }

    // ── Bulk mark-billed mode ──
    if (body.mark_billed && body.entry_ids && body.invoice_number) {
      // Standalone `time_entry` pages bill on their own page — the matter
      // array doesn't contain them.
      const standaloneIds = body.entry_ids.filter((id) => id.startsWith(STANDALONE_ENTRY_PREFIX));
      const caseIds = body.entry_ids.filter((id) => !id.startsWith(STANDALONE_ENTRY_PREFIX));

      let billedResult: { updated: number; not_found: string[]; already_billed: string[] } = {
        updated: 0,
        not_found: [],
        already_billed: [],
      };
      if (caseIds.length > 0) {
        if (!body.case_slug) {
          return apiError(
            "case_slug_and_id_required",
            "case_slug erforderlich für Akten-Einträge",
            400
          );
        }
        const caseSlug = body.case_slug;
        try {
          const { meta } = await writeTimeEntriesWithRetry<{
            updated: number;
            not_found: string[];
            already_billed: string[];
          }>(
            brain,
            caseSlug,
            (freshEntries) => {
              const entriesWithCase: TimeEntryWithCase[] = freshEntries.map((e) => ({
                ...e,
                case_slug: body.case_slug,
              }));
              const result = markEntriesBilled(entriesWithCase, caseIds, body.invoice_number!);
              return {
                nextEntries: result.entries.map(({ case_slug: _cs, ...e }) => e),
                meta: {
                  updated: result.updated,
                  not_found: result.not_found,
                  already_billed: result.already_billed,
                },
              };
            },
            timeEntryWriteLog
          );
          billedResult = meta;
        } catch (err) {
          const mapped = timeEntryWriteError(err);
          if (mapped) return mapped;
          throw err;
        }
      }

      if (standaloneIds.length > 0) {
        const standalone = await updateStandaloneBilling(brain, standaloneIds, {
          billed: true,
          invoiceNumber: body.invoice_number,
        });
        billedResult = {
          updated: billedResult.updated + standalone.updated,
          not_found: [...billedResult.not_found, ...standalone.not_found],
          already_billed: [...billedResult.already_billed, ...standalone.already_billed],
        };
      }

      if (billedResult.updated === 0) {
        return apiError("time_entry_not_found", "Keine der angegebenen Zeiteinträge gefunden", 404);
      }

      broadcastSseEvent(ctx.brainId, "time.entry.billed", {
        case_slug: body.case_slug,
        invoice_number: body.invoice_number,
        updated: billedResult.updated,
      });

      return apiSuccess({
        updated: billedResult.updated,
        not_found: billedResult.not_found,
        already_billed: billedResult.already_billed,
        invoice_number: body.invoice_number,
      });
    }

    // ── Single entry update mode ──
    // `billed`/`invoice_number` are deliberately absent: billing state changes
    // only through mark-billed/unbill so the audit details keep the invoice
    // number and the billed guard can't be bypassed field-wise.
    const allowedUpdates: Partial<TimeEntry> = {};
    const allowed = [
      "description",
      "minutes",
      "date",
      "rate",
      "billable",
      "lawyer",
      "activity_type",
      "approval_status",
    ] as const;
    for (const key of allowed) {
      const value = body[key];
      if (value !== undefined) {
        (allowedUpdates as Record<string, unknown>)[key] = value;
      }
    }

    if (standalone) {
      // Timer/import entries live as standalone pages — without this
      // fallback the UI's edit hit a 404 on an entry it had just listed.
      const page = await brain.getPage(body.id).catch(() => null);
      const fm = (page?.frontmatter ?? null) as Record<string, unknown> | null;
      if (!fm || fm.status === "tombstoned") {
        return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);
      }
      if (fm.billed === true) {
        return apiError(
          "time_entry_billed",
          "Der Eintrag ist bereits abgerechnet — zuerst die Abrechnung zurücknehmen.",
          409
        );
      }
      const nextFm = { ...fm, ...allowedUpdates };
      await brain.updatePage({ slug: body.id, frontmatter: nextFm });
      broadcastSseEvent(ctx.brainId, "time.entry.updated", { entry_id: body.id });
      return apiSuccess({ entry: standaloneEntryFromPage(body.id, nextFm) });
    }

    let updated: TimeEntry;
    try {
      const { meta } = await writeTimeEntriesWithRetry<TimeEntry>(
        brain,
        body.case_slug!,
        (freshEntries) => {
          const result = updateEntry(freshEntries, body.id, allowedUpdates);
          if (result.billed) return { billed: true };
          if (!result.found || !result.updated) return { notFound: true };
          const meta: TimeEntry = result.updated;
          return { nextEntries: result.entries, meta };
        },
        timeEntryWriteLog
      );
      updated = meta;
    } catch (err) {
      const mapped = timeEntryWriteError(err);
      if (mapped) return mapped;
      throw err;
    }

    broadcastSseEvent(ctx.brainId, "time.entry.updated", {
      case_slug: body.case_slug,
      entry_id: body.id,
    });

    return apiSuccess({ entry: updated });
  }
);

export const DELETE = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: timeDeleteSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "time_entry",
      entityId: body.id,
    }),
  },
  async (ctx, body, _query, _req) => {
    const brain = createServerBrainClient(ctx.headers);

    if (body.id.startsWith(STANDALONE_ENTRY_PREFIX)) {
      // Standalone `time_entry` page — tombstone, not removal: keeps the
      // audit trail and the id stable; listAllTimeEntries filters it out.
      const page = await brain.getPage(body.id).catch(() => null);
      const fm = (page?.frontmatter ?? null) as Record<string, unknown> | null;
      if (!fm || fm.status === "tombstoned") {
        return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);
      }
      if (fm.billed === true) {
        return apiError(
          "time_entry_billed",
          "Der Eintrag ist bereits abgerechnet — zuerst die Abrechnung zurücknehmen.",
          409
        );
      }
      await brain.updatePage({ slug: body.id, frontmatter: { ...fm, status: "tombstoned" } });
      broadcastSseEvent(ctx.brainId, "time.entry.deleted", { entry_id: body.id });
      return apiSuccess({ ok: true });
    }

    if (!body.case_slug) {
      return apiError("case_slug_and_id_required", "case_slug und id erforderlich", 400);
    }
    const exists = await brain.getPage(body.case_slug).catch(() => null);
    if (!exists) return apiError("case_not_found", "Akte nicht gefunden", 404);

    try {
      await writeTimeEntriesWithRetry(
        brain,
        body.case_slug,
        (freshEntries) => {
          const result = deleteEntry(freshEntries, body.id);
          if (result.billed) return { billed: true };
          if (!result.found) return { notFound: true };
          return { nextEntries: result.entries, meta: null };
        },
        timeEntryWriteLog
      );
    } catch (err) {
      const mapped = timeEntryWriteError(err);
      if (mapped) return mapped;
      throw err;
    }

    broadcastSseEvent(ctx.brainId, "time.entry.deleted", {
      case_slug: body.case_slug,
      entry_id: body.id,
    });

    return apiSuccess({ ok: true });
  }
);
