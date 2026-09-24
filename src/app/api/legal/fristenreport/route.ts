import { NextRequest } from "next/server";
import { z } from "zod";
import { uiLanguageSchema } from "@/lib/api-validation";
import { createHandler, apiError } from "@/lib/api-handler";
import { GET as getFristen, type Frist } from "@/app/api/legal/fristen/route";
import { buildWorkProductReceipt } from "@/lib/work-product-receipts";
import { storeReceipt } from "@/lib/work-product-receipt-store";

import { logger } from "@/lib/logger";
const log = logger("api/legal/fristenreport");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fristenreportSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  jurisdiction: z.enum(["at", "de", "ch"]).default("at"),
  language: uiLanguageSchema.default("de"),
  include_overdue: z.boolean().default(true),
  include_upcoming_days: z.number().min(0).max(365).default(30),
});

/**
 * POST /api/legal/fristenreport — deadline report for one matter.
 *
 * Deterministic: built from the unified Fristen read model (/api/legal/fristen:
 * Fristenbuch + legal_deadline pages + case deadlines, with review status).
 * It used to proxy to an engine route that never existed and charged credits
 * for a call that always failed. No model call is involved, so no credits.
 */
export const POST = createHandler(
  {
    action: "legal.fristenreport",
    rateTier: "standard",
    body: fristenreportSchema,
    audit: (_ctx, b) => ({
      action: "legal.fristenreport" as const,
      entityType: "deadline",
      details: {
        case_slug: b.case_slug,
        include_overdue: b.include_overdue,
        include_upcoming_days: b.include_upcoming_days,
      },
    }),
  },
  async (ctx, body, _query, req) => {
    const url = new URL("/api/legal/fristen", req.url);
    url.searchParams.set("case", body.case_slug);
    const res = await getFristen(new NextRequest(url, { headers: req.headers }), {
      params: Promise.resolve({}),
    });
    if (!res.ok) {
      log.error(`[fristenreport] fristen read failed: HTTP ${res.status}`);
      return apiError("service_unavailable", "Fristen konnten nicht geladen werden", 503);
    }
    const { fristen, partial } = (await res.json()) as { fristen: Frist[]; partial?: boolean };

    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + body.include_upcoming_days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const open = fristen.filter((f) => f.status !== "done");
    const overdue = body.include_overdue ? open.filter((f) => f.due_date < today) : [];
    const upcoming = open
      .filter((f) => f.due_date >= today && f.due_date <= horizon)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const unreviewed = open.filter((f) => f.review_status && f.review_status !== "approved");

    const report = {
      case_slug: body.case_slug,
      generated_at: new Date().toISOString(),
      stichtag: today,
      horizon,
      summary: {
        open: open.length,
        overdue: overdue.length,
        upcoming: upcoming.length,
        unreviewed: unreviewed.length,
        notfristen_without_second_check: open.filter((f) => f.is_notfrist && !f.second_check_at)
          .length,
      },
      overdue,
      upcoming,
      unreviewed,
      // A deadline source failed: the report must say it may be missing Fristen.
      ...(partial
        ? {
            partial: true,
            warning:
              "Fristen konnten nicht vollständig geladen werden — der Bericht kann Fristen auslassen.",
          }
        : {}),
    };

    // Work-product receipt (audit trail), scoped to the caller's brain.
    // Deterministic report: no model, no prompt — the receipt records the
    // output hash and that no model was involved.
    try {
      await storeReceipt(
        buildWorkProductReceipt({
          product_type: "fristenreport",
          product_ref: `${body.case_slug}/fristenreport`,
          output: report,
          brain_id: ctx.brainId,
          user_id: ctx.user.id,
          jurisdiction: body.jurisdiction,
          models: [],
          metadata: { deterministic: true },
        })
      );
    } catch (err) {
      log.error(
        "[fristenreport] receipt store failed:",
        err instanceof Error ? err.message : String(err)
      );
    }

    return Response.json(report);
  }
);
