import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import type { DeadlineStatus } from "@/lib/legal-deadlines";
import {
  DEADLINE_SOURCES,
  loadFristenReadModel,
  loadFristenReadModelCached,
} from "@/lib/fristen-read-model";
import { topbarDeadlineWarnings } from "@/lib/topbar-deadline-warnings";
import { firmToday } from "@/lib/datetime";
import { z } from "zod";

export type { Frist } from "@/lib/fristen-read-model";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  case: z.string().max(500).optional(),
  status: z.string().max(50).optional(),
  heute: z.string().max(10).optional(),
  /** "warnings": only open deadlines due within TOPBAR_WARNING_DAYS (topbar). */
  view: z.enum(["warnings"]).optional(),
});



/**
 * GET /api/legal/fristen — the unified Fristen read model
 * (src/lib/fristen-read-model.ts), filtered, sorted and summarised.
 *
 * Query params:
 *   - case: filter by case slug
 *   - status: filter by status (overdue, critical, warning, vorfrist, pending, done)
 *   - heute: override "today" date (ISO YYYY-MM-DD, for testing)
 *
 * A failed deadline source is reported as `partial: true` + `failed_sources`;
 * when every deadline source fails the route answers 503.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const statusFilter = query.status;
    const load = () =>
      loadFristenReadModel(ctx.headers, {
        caseFilter: query.case,
        heute: query.heute,
      });
    const model =
      query.view === "warnings"
        ? await loadFristenReadModelCached(ctx.headers, {
            caseFilter: query.case,
            heute: query.heute ?? firmToday(),
          })
        : await load();
    const failedSources = model.failedSources;
    const fristen =
      query.view === "warnings"
        ? model.fristen.filter((f) =>
            topbarDeadlineWarnings([f], query.heute ?? firmToday()).length > 0
          )
        : model.fristen;

    const deadlineSources = DEADLINE_SOURCES;
    if (deadlineSources.every((src) => failedSources.includes(src))) {
      return NextResponse.json(
        {
          error: "fristen_unavailable",
          message: "Fristen konnten nicht geladen werden — bitte erneut versuchen.",
          failed_sources: failedSources,
        },
        { status: 503 }
      );
    }

    // ── Filter by status ──────────────────────────────────────────────────
    const filtered = statusFilter ? fristen.filter((f) => f.status === statusFilter) : fristen;

    // ── Sort: overdue first, then by due_date ascending ───────────────────
    const statusRank: Record<DeadlineStatus, number> = {
      overdue: 0,
      critical: 1,
      warning: 2,
      vorfrist: 3,
      pending: 4,
      done: 5,
    };
    filtered.sort(
      (a, b) => statusRank[a.status] - statusRank[b.status] || a.due_date.localeCompare(b.due_date)
    );

    // ── Summary ───────────────────────────────────────────────────────────
    const zusammenfassung = {
      gesamt: filtered.length,
      overdue: filtered.filter((f) => f.status === "overdue").length,
      critical: filtered.filter((f) => f.status === "critical").length,
      warning: filtered.filter((f) => f.status === "warning").length,
      vorfrist: filtered.filter((f) => f.status === "vorfrist").length,
      pending: filtered.filter((f) => f.status === "pending").length,
      done: filtered.filter((f) => f.status === "done").length,
    };

    return NextResponse.json({
      fristen: filtered,
      zusammenfassung,
      // Only a failed DEADLINE source makes the list incomplete; a failed
      // absence read merely loses the Urlaubsvertretung hint.
      ...(failedSources.some((src) => deadlineSources.includes(src)) ? { partial: true } : {}),
      ...(failedSources.length > 0 ? { failed_sources: failedSources } : {}),
    });
  }
);
