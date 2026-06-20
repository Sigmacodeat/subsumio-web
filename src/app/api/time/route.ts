
import { z } from "zod";
import { api } from "@/lib/api";
import type { TimeEntry } from "@/lib/legal-types";
import { createHandler, apiError } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const timeQuerySchema = z.object({
  caseSlug: z.string().optional(),
  case_slug: z.string().optional(),
  billable: z.string().optional(),
  unbilled: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  lawyer: z.string().optional(),
  limit: z.string().optional(),
}).passthrough();

const timePostSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  description: z.string().min(1, "description_required").max(500),
  minutes: z.union([z.number(), z.string()]).transform((v) => typeof v === "number" ? Math.round(v) : parseInt(String(v), 10)).pipe(z.number().positive("minutes_required_positive")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_required_iso"),
  rate: z.number().min(0).optional(),
  billable: z.boolean().default(true),
  activity_type: z.enum(["research", "drafting", "court", "meeting", "other"]).default("other"),
  lawyer: z.string().max(100).optional(),
});

const timePatchSchema = z.object({
  case_slug: z.string().min(1, "case_slug_and_id_required"),
  id: z.string().min(1, "case_slug_and_id_required"),
}).passthrough();

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
  async (_ctx, _body, query, _req) => {
    const caseSlug = query.caseSlug || query.case_slug || "";
    const billableOnly = query.billable === "true";
    const unbilledOnly = query.unbilled === "true";
    const from = query.from || "";
    const to = query.to || "";
    const lawyerFilter = query.lawyer || "";
    const limit = Math.min(parseInt(query.limit || "200", 10), 500);

    try {
      let entries: (TimeEntry & { case_slug?: string })[] = [];

      if (caseSlug) {
        const casePage = await api.brain.getPage(caseSlug).catch(() => null);
        if (casePage) {
          const fm = casePage.frontmatter as Record<string, unknown>;
          const raw = Array.isArray(fm.time_entries) ? fm.time_entries as TimeEntry[] : [];
          entries = raw.map((e) => ({ ...e, case_slug: caseSlug }));
        }
      } else {
        const pages = await api.brain.listPages({ type: "time_entry", limit });
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

      if (billableOnly) entries = entries.filter((e) => e.billable);
      if (unbilledOnly) entries = entries.filter((e) => !e.billed);
      if (from) entries = entries.filter((e) => e.date >= from);
      if (to) entries = entries.filter((e) => e.date <= to);
      if (lawyerFilter) entries = entries.filter((e) => e.lawyer?.toLowerCase().includes(lawyerFilter.toLowerCase()));

      entries = entries.slice(0, limit);

      const totalMinutes = entries.reduce((sum, e) => sum + (e.minutes || 0), 0);
      const totalAmount = entries.reduce((sum, e) => {
        if (!e.billable) return sum;
        const hours = (e.minutes || 0) / 60;
        return sum + hours * (e.rate || 0);
      }, 0);

      return Response.json({
        entries,
        total: entries.length,
        summary: {
          total_minutes: totalMinutes,
          total_hours: Math.round(totalMinutes / 60 * 100) / 100,
          billable_amount: Math.round(totalAmount * 100) / 100,
        },
      });
    } catch (err) {
      console.error("[time] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Zeiterfassung konnte nicht geladen werden", 500);
    }
  },
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
      details: { minutes: body.minutes, billable: body.billable, description: body.description.slice(0, 80) },
    }),
  },
  async (ctx, body, _query, _req) => {
    const id = `time-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry: TimeEntry = {
      id,
      description: body.description,
      minutes: body.minutes,
      date: body.date,
      rate: body.rate,
      billable: body.billable,
      billed: false,
      lawyer: body.lawyer || ctx.user.name || ctx.user.email,
      activity_type: body.activity_type,
    };

    const casePage = await api.brain.getPage(body.case_slug).catch(() => null);
    if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const fm = casePage.frontmatter as Record<string, unknown>;
    const existing = Array.isArray(fm.time_entries) ? fm.time_entries as TimeEntry[] : [];
    existing.push(entry);

    await api.brain.updatePage({
      slug: body.case_slug,
      frontmatter: { ...fm, time_entries: existing },
    });

    return Response.json({ entry, case_slug: body.case_slug }, { status: 201 });
  },
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
  async (_ctx, body, _query, _req) => {
    const casePage = await api.brain.getPage(body.case_slug).catch(() => null);
    if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const fm = casePage.frontmatter as Record<string, unknown>;
    const entries = Array.isArray(fm.time_entries) ? fm.time_entries as TimeEntry[] : [];
    const idx = entries.findIndex((e) => e.id === body.id);
    if (idx === -1) return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);

    const allowed: (keyof TimeEntry)[] = ["description", "minutes", "date", "rate", "billable", "billed", "lawyer", "activity_type", "invoice_number"];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        (entries[idx] as unknown as Record<string, unknown>)[key] = body[key];
      }
    }

    await api.brain.updatePage({ slug: body.case_slug, frontmatter: { ...fm, time_entries: entries } });
    return Response.json({ entry: entries[idx] });
  },
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
  async (_ctx, body, _query, _req) => {
    const casePage = await api.brain.getPage(body.case_slug).catch(() => null);
    if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const fm = casePage.frontmatter as Record<string, unknown>;
    const entries = Array.isArray(fm.time_entries) ? fm.time_entries as TimeEntry[] : [];
    const filtered = entries.filter((e) => e.id !== body.id);
    if (filtered.length === entries.length) return apiError("time_entry_not_found", "Zeiteintrag nicht gefunden", 404);

    await api.brain.updatePage({ slug: body.case_slug, frontmatter: { ...fm, time_entries: filtered } });
    return Response.json({ ok: true });
  },
);
