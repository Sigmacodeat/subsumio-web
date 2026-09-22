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
  type TimeEntryWithCase,
} from "@/lib/time-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/time");

export const dynamic = "force-dynamic";

/**
 * Every write below is a read-modify-write on the case page's single
 * `time_entries` array field: fetch the case, compute a new array in
 * application code, POST the whole array back via merge-update. There is no
 * atomic array-append/patch primitive on the engine for this — two
 * concurrent writes (e.g. two lawyers logging time on the same case within
 * the same second) can both read the same starting array, and whichever
 * merge-update lands second silently overwrites the first's entry with no
 * error to either caller.
 *
 * This doesn't make the write atomic (that needs an engine-side primitive —
 * flagged separately), but it turns "silently lose data" into "detect the
 * clobber and retry with a fresh read", which closes the race for the
 * common case (two people saving moments apart) and fails loudly instead of
 * silently for the rare case (landing in the same sub-request window
 * repeatedly).
 */
const TIME_ENTRIES_WRITE_MAX_ATTEMPTS = 5;

class TimeEntriesNotFoundError extends Error {}
class TimeEntriesWriteConflictError extends Error {}

async function writeTimeEntriesWithRetry<M>(
  brain: ReturnType<typeof createServerBrainClient>,
  caseSlug: string,
  compute: (
    freshEntries: TimeEntry[],
    freshFrontmatter: Record<string, unknown>
  ) => { nextEntries: TimeEntry[]; meta: M } | { notFound: true }
): Promise<{ entries: TimeEntry[]; meta: M }> {
  for (let attempt = 0; attempt < TIME_ENTRIES_WRITE_MAX_ATTEMPTS; attempt++) {
    const casePage = await brain.getPage(caseSlug);
    const fm = casePage.frontmatter as Record<string, unknown>;
    const freshEntries = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];

    const outcome = compute(freshEntries, fm);
    if ("notFound" in outcome) throw new TimeEntriesNotFoundError();

    await brain.updatePage({
      slug: caseSlug,
      frontmatter: { ...fm, time_entries: outcome.nextEntries },
    });

    // Verify nothing else wrote to time_entries between our read and our
    // write landing — a concurrent writer's own merge-update would have
    // been based on the same freshEntries snapshot and so produces a
    // different resulting array than ours.
    const verifyPage = await brain.getPage(caseSlug);
    const verifyEntries = Array.isArray(verifyPage.frontmatter?.time_entries)
      ? (verifyPage.frontmatter.time_entries as TimeEntry[])
      : [];
    if (JSON.stringify(verifyEntries) === JSON.stringify(outcome.nextEntries)) {
      return { entries: outcome.nextEntries, meta: outcome.meta };
    }
    log.warn("[time] write_conflict, retrying", { caseSlug, attempt });
    await new Promise((r) => setTimeout(r, 25 + Math.random() * 75));
  }
  log.error("[time] write_conflict exhausted retries", { caseSlug });
  throw new TimeEntriesWriteConflictError();
}

/** The engine returns at most 100 pages per request; page through the rest. */
async function listAllOfType(
  brain: ReturnType<typeof createServerBrainClient>,
  type: string,
  max = 5000
) {
  const out: Awaited<ReturnType<typeof brain.listPages>> = [];
  for (let offset = 0; offset < max; offset += 100) {
    const batch = await brain.listPages({ type, limit: 100, offset });
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
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

const timePostSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  description: z.string().min(1, "description_required").max(500),
  minutes: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "number" ? Math.round(v) : parseInt(String(v), 10)))
    .pipe(z.number().positive("minutes_required_positive")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_required_iso"),
  rate: z.number().min(0).optional(),
  billable: z.boolean().default(true),
  activity_type: z
    .enum(["research", "drafting", "court", "meeting", "correspondence", "other"])
    .default("other"),
  lawyer: z.string().max(100).optional(),
});

const timePatchSchema = z
  .object({
    case_slug: z.string().min(1, "case_slug_and_id_required"),
    id: z.string().min(1, "case_slug_and_id_required"),
    mark_billed: z.boolean().optional(),
    entry_ids: z.array(z.string().min(1)).optional(),
    invoice_number: z.string().min(1).optional(),
    approval_status: z.enum(["pending", "approved", "rejected"]).optional(),
  })
  .passthrough();

const timeDeleteSchema = z.object({
  case_slug: z.string().min(1, "case_slug_and_id_required"),
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
    const limit = Math.min(parseInt(query.limit || "200", 10), 500);
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
        // Time is recorded in two places: the `time_entries` list of each
        // matter (the time API, the matter tab, the timer) and standalone
        // `time_entry` pages (imports). The firm-wide view reads both —
        // before, it read only the pages and showed nothing for entries booked
        // in a matter.
        const [pages, cases] = await Promise.all([
          listAllOfType(brain, "time_entry"),
          listAllOfType(brain, "legal_case"),
        ]);
        const fromPages: TimeEntryWithCase[] = pages.map((p) => {
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
          } as TimeEntryWithCase;
        });
        const fromCases: TimeEntryWithCase[] = cases.flatMap((c) => {
          const fm = (c.frontmatter ?? {}) as Record<string, unknown>;
          if (String(fm.status ?? "") === "tombstoned") return [];
          const raw = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];
          return raw.map((e) => ({ ...e, case_slug: c.slug }));
        });
        const seen = new Set<string>();
        entries = [...fromCases, ...fromPages]
          .filter((e) => {
            const key = `${e.case_slug ?? ""}#${e.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
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
      await writeTimeEntriesWithRetry(brain, body.case_slug, (freshEntries) => ({
        nextEntries: [...freshEntries, entry],
        meta: null,
      }));
    } catch (err) {
      if (err instanceof TimeEntriesWriteConflictError) {
        return apiError(
          "write_conflict",
          "Zeiteintrag konnte nicht gespeichert werden — bitte erneut versuchen.",
          409
        );
      }
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
    const exists = await brain.getPage(body.case_slug).catch(() => null);
    if (!exists) return apiError("case_not_found", "Akte nicht gefunden", 404);

    // ── Bulk mark-billed mode ──
    if (body.mark_billed && body.entry_ids && body.invoice_number) {
      let billedResult: { updated: number; not_found: string[] };
      try {
        const { meta } = await writeTimeEntriesWithRetry(brain, body.case_slug, (freshEntries) => {
          const entriesWithCase: TimeEntryWithCase[] = freshEntries.map((e) => ({
            ...e,
            case_slug: body.case_slug,
          }));
          const result = markEntriesBilled(entriesWithCase, body.entry_ids!, body.invoice_number!);
          return {
            nextEntries: result.entries.map(({ case_slug: _cs, ...e }) => e),
            meta: { updated: result.updated, not_found: result.not_found },
          };
        });
        billedResult = meta;
      } catch (err) {
        if (err instanceof TimeEntriesWriteConflictError) {
          return apiError(
            "write_conflict",
            "Zeiteinträge konnten nicht als abgerechnet markiert werden — bitte erneut versuchen.",
            409
          );
        }
        throw err;
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
        invoice_number: body.invoice_number,
      });
    }

    // ── Single entry update mode ──
    const allowedUpdates: Partial<TimeEntry> = {};
    const allowed: (keyof TimeEntry)[] = [
      "description",
      "minutes",
      "date",
      "rate",
      "billable",
      "billed",
      "lawyer",
      "activity_type",
      "invoice_number",
      "approval_status",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        (allowedUpdates as Record<string, unknown>)[key] = body[key];
      }
    }

    let updated: TimeEntry;
    try {
      const { meta } = await writeTimeEntriesWithRetry<TimeEntry>(
        brain,
        body.case_slug,
        (freshEntries) => {
          const result = updateEntry(freshEntries, body.id, allowedUpdates);
          if (!result.found || !result.updated) return { notFound: true };
          const meta: TimeEntry = result.updated;
          return { nextEntries: result.entries, meta };
        }
      );
      updated = meta;
    } catch (err) {
      if (err instanceof TimeEntriesNotFoundError) {
        return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);
      }
      if (err instanceof TimeEntriesWriteConflictError) {
        return apiError(
          "write_conflict",
          "Zeiteintrag konnte nicht aktualisiert werden — bitte erneut versuchen.",
          409
        );
      }
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
    const exists = await brain.getPage(body.case_slug).catch(() => null);
    if (!exists) return apiError("case_not_found", "Akte nicht gefunden", 404);

    try {
      await writeTimeEntriesWithRetry(brain, body.case_slug, (freshEntries) => {
        const result = deleteEntry(freshEntries, body.id);
        if (!result.found) return { notFound: true };
        return { nextEntries: result.entries, meta: null };
      });
    } catch (err) {
      if (err instanceof TimeEntriesNotFoundError) {
        return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);
      }
      if (err instanceof TimeEntriesWriteConflictError) {
        return apiError(
          "write_conflict",
          "Zeiteintrag konnte nicht gelöscht werden — bitte erneut versuchen.",
          409
        );
      }
      throw err;
    }

    broadcastSseEvent(ctx.brainId, "time.entry.deleted", {
      case_slug: body.case_slug,
      entry_id: body.id,
    });

    return apiSuccess({ ok: true });
  }
);
