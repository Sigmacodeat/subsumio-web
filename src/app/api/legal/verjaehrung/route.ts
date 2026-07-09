import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { encodeSlugPath } from "@/lib/utils";
import {
  createStatuteOfLimitations,
  addInterruption,
  addSuspension,
  recompute,
  isBarred,
  daysUntilBarred,
  VERJAEHRUNG_PRESETS,
} from "@/lib/legal-verjaehrung";
import type { StatuteOfLimitations, CaseFrontmatter } from "@/lib/legal-types";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  caseSlug: z.string().min(1).max(500),
  presetKey: z.string().max(50).optional(),
  claimLabel: z.string().max(200).optional(),
  claimType: z.string().max(100).optional(),
  law: z.string().max(100).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodYears: z.number().int().min(1).max(50).optional(),
  maxPeriodYears: z.number().int().min(1).max(100).optional(),
});

const addEventSchema = z.object({
  caseSlug: z.string().min(1).max(500),
  solId: z.string().min(1).max(100),
  eventType: z.enum(["interruption", "suspension"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  reason: z.string().max(500),
  kind: z.string().max(100).optional(),
  note: z.string().max(1000).optional(),
});

async function fetchCaseFrontmatter(
  headers: Record<string, string>,
  caseSlug: string
): Promise<CaseFrontmatter | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlugPath(caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const page = (await res.json()) as {
    slug: string;
    frontmatter?: Record<string, unknown>;
  };
  return (page.frontmatter ?? {}) as CaseFrontmatter;
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: z.union([createSchema, addEventSchema]),
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "legal_case",
      entityId: "caseSlug" in body ? body.caseSlug : "unknown",
      details: {
        type: "verjaehrung",
        actorId: ctx.user.id,
        actorEmail: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    if ("eventType" in body) {
      return handleAddEvent(ctx.headers, body);
    }
    return handleCreate(ctx.headers, body);
  }
);

async function handleCreate(headers: Record<string, string>, body: z.infer<typeof createSchema>) {
  const fm = await fetchCaseFrontmatter(headers, body.caseSlug);
  if (!fm) {
    return apiError("not_found", "Akte nicht gefunden", 404);
  }

  let params: {
    claim_label: string;
    claim_type: string;
    law: string;
    start_date: string;
    period_years: number;
    max_period_years?: number;
  };

  if (body.presetKey) {
    const preset = VERJAEHRUNG_PRESETS.find((p) => p.key === body.presetKey);
    if (!preset) {
      return apiError("bad_request", "Unbekannte Verjährungsvorlage", 400);
    }
    params = {
      claim_label: body.claimLabel || preset.label,
      claim_type: preset.claim_type,
      law: preset.law,
      start_date: body.startDate,
      period_years: preset.period_years,
      max_period_years: preset.max_period_years,
    };
  } else {
    if (!body.claimLabel || !body.law || !body.periodYears) {
      return apiError("bad_request", "claimLabel, law und periodYears sind erforderlich", 400);
    }
    params = {
      claim_label: body.claimLabel,
      claim_type: body.claimType || "allgemeiner Anspruch",
      law: body.law,
      start_date: body.startDate,
      period_years: body.periodYears,
      max_period_years: body.maxPeriodYears,
    };
  }

  const sol = createStatuteOfLimitations(params);
  const existing = fm.statute_of_limitations ?? [];

  // Auto-create a legal_deadline page for the effective barred date
  const deadlineSlug = `legal/deadlines/verjaehrung-${body.caseSlug.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(-60)}-${sol.id}`;
  const deadlineDate = sol.effective_barred_date ?? sol.regular_barred_date;
  const now = new Date().toISOString();

  await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      slug: deadlineSlug,
      title: `Verjährung: ${sol.claim_label}`,
      type: "legal_deadline",
      content: `Automatisch generiert aus Verjährungseintrag.\n\nGesetz: ${sol.law}\nBeginn: ${sol.start_date}\nFrist: ${sol.period_years} Jahre${sol.max_period_years ? ` (max. ${sol.max_period_years} Jahre)` : ""}\nEffektives Verjährungsdatum: ${deadlineDate}`,
      frontmatter: {
        type: "legal_deadline",
        event_type: "verjaehrung",
        due_date: deadlineDate,
        description: sol.claim_label,
        status: "pending",
        review_status: "unreviewed",
        source: "verjaehrung_auto",
        law: sol.law,
        case_slug: body.caseSlug,
        is_notfrist: true,
        noRoll: true,
        created_at: now,
        updated_at: now,
      },
      merge: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const solWithDeadline = { ...sol, deadline_slug: deadlineSlug };
  const updated = [...existing, solWithDeadline];

  await enginePatchPage(headers, {
    slug: body.caseSlug,
    frontmatter: {
      statute_of_limitations: updated,
    } as Record<string, unknown>,
  });

  return apiSuccess({
    ok: true,
    statuteOfLimitations: solWithDeadline,
    total: updated.length,
    deadlineSlug,
  });
}

async function handleAddEvent(
  headers: Record<string, string>,
  body: z.infer<typeof addEventSchema>
) {
  const fm = await fetchCaseFrontmatter(headers, body.caseSlug);
  if (!fm) {
    return apiError("not_found", "Akte nicht gefunden", 404);
  }

  const existing = fm.statute_of_limitations ?? [];
  const idx = existing.findIndex((s) => s.id === body.solId);
  if (idx === -1) {
    return apiError("not_found", "Verjährungseintrag nicht gefunden", 404);
  }

  let sol = existing[idx];
  if (body.eventType === "interruption") {
    sol = addInterruption(sol, {
      at: body.date,
      reason: body.reason,
      kind:
        (body.kind as "acknowledgment" | "lawsuit" | "dunning" | "negotiation" | "other") ||
        "negotiation",
      note: body.note,
    });
  } else {
    sol = addSuspension(sol, {
      start: body.date,
      end: body.endDate,
      reason: body.reason,
      note: body.note,
    });
  }

  const updated = [...existing];
  updated[idx] = sol;

  await enginePatchPage(headers, {
    slug: body.caseSlug,
    frontmatter: {
      statute_of_limitations: updated,
    } as Record<string, unknown>,
  });

  // Update the linked deadline page if the effective date changed
  if (sol.deadline_slug && sol.effective_barred_date) {
    await enginePatchPage(headers, {
      slug: sol.deadline_slug,
      frontmatter: {
        due_date: sol.effective_barred_date,
        updated_at: new Date().toISOString(),
      },
    });
  }

  return apiSuccess({
    ok: true,
    statuteOfLimitations: sol,
    isBarred: isBarred(sol),
    daysUntilBarred: daysUntilBarred(sol),
  });
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, query) => {
    const caseSlug = (query as Record<string, string>).caseSlug;
    if (!caseSlug) {
      return apiError("bad_request", "caseSlug ist erforderlich", 400);
    }

    const fm = await fetchCaseFrontmatter(ctx.headers, caseSlug);
    if (!fm) {
      return apiError("not_found", "Akte nicht gefunden", 404);
    }

    const sols = (fm.statute_of_limitations ?? []).map((sol) => {
      const recomputed = recompute(sol);
      return {
        ...recomputed,
        isBarred: isBarred(recomputed),
        daysUntilBarred: daysUntilBarred(recomputed),
      };
    });

    return apiSuccess({
      items: sols,
      total: sols.length,
      presets: VERJAEHRUNG_PRESETS,
    });
  }
);
