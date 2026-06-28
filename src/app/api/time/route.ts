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

export const dynamic = "force-dynamic";

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
  activity_type: z.enum(["research", "drafting", "court", "meeting", "other"]).default("other"),
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
        const pages = await brain.listPages({ type: "time_entry", limit });
        entries = pages.map((p) => {
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
      console.error("[time] list failed:", err instanceof Error ? err.message : String(err));
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

    const casePage = await brain.getPage(body.case_slug).catch(() => null);
    if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const fm = casePage.frontmatter as Record<string, unknown>;
    const existing = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];
    existing.push(entry);

    await brain.updatePage({
      slug: body.case_slug,
      frontmatter: { ...fm, time_entries: existing },
    });

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
    const casePage = await brain.getPage(body.case_slug).catch(() => null);
    if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const fm = casePage.frontmatter as Record<string, unknown>;
    const entries = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];

    // ── Bulk mark-billed mode ──
    if (body.mark_billed && body.entry_ids && body.invoice_number) {
      const entriesWithCase: TimeEntryWithCase[] = entries.map((e) => ({
        ...e,
        case_slug: body.case_slug,
      }));
      const result = markEntriesBilled(entriesWithCase, body.entry_ids, body.invoice_number);

      if (result.updated === 0) {
        return apiError("time_entry_not_found", "Keine der angegebenen Zeiteinträge gefunden", 404);
      }

      const updatedEntries = result.entries.map(({ case_slug: _cs, ...e }) => e);
      await brain.updatePage({
        slug: body.case_slug,
        frontmatter: { ...fm, time_entries: updatedEntries },
      });

      broadcastSseEvent(ctx.brainId, "time.entry.billed", {
        case_slug: body.case_slug,
        invoice_number: body.invoice_number,
        updated: result.updated,
      });

      return apiSuccess({
        updated: result.updated,
        not_found: result.not_found,
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
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        (allowedUpdates as Record<string, unknown>)[key] = body[key];
      }
    }

    const result = updateEntry(entries, body.id, allowedUpdates);
    if (!result.found) return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);

    await brain.updatePage({
      slug: body.case_slug,
      frontmatter: { ...fm, time_entries: result.entries },
    });

    broadcastSseEvent(ctx.brainId, "time.entry.updated", {
      case_slug: body.case_slug,
      entry_id: body.id,
    });

    return apiSuccess({ entry: result.updated });
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
    const casePage = await brain.getPage(body.case_slug).catch(() => null);
    if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const fm = casePage.frontmatter as Record<string, unknown>;
    const entries = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];
    const result = deleteEntry(entries, body.id);
    if (!result.found) return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);

    await brain.updatePage({
      slug: body.case_slug,
      frontmatter: { ...fm, time_entries: result.entries },
    });

    broadcastSseEvent(ctx.brainId, "time.entry.deleted", {
      case_slug: body.case_slug,
      entry_id: body.id,
    });

    return apiSuccess({ ok: true });
  }
);
