import { NextResponse } from "next/server";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { createHandler } from "@/lib/api-handler";
import { normalizeFristenbuchStatus, computeDeadlineStatus } from "@/lib/legal-deadlines";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  case: z.string().max(500).optional(),
  heute: z.string().max(10).optional(),
});

/**
 * GET /api/legal/fristenbuch — Proxies the Engine's Fristenbuch API
 * (deterministic classification via frist-engine) to the web domain.
 *
 * Query params:
 *   - case: filter by case slug
 *   - heute: override "today" date (ISO YYYY-MM-DD)
 *
 * Returns Fristenbuch JSON with eintraege[] and zusammenfassung.
 *
 * FALLBACK: When the engine's fristenbuch has no entries (e.g. a fresh
 * brain with only legal_case frontmatter.deadlines), we merge in deadlines
 * from legal_case pages so the fristenbuch is never empty when deadlines
 * exist.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    try {
      const params = new URLSearchParams();
      if (query.case) params.set("case", query.case);
      if (query.heute) params.set("heute", query.heute);

      const url = `${ENGINE_URL}/api/legal/fristenbuch${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(data, { status: res.status });
      }
      // E1: Normalize engine's old German status enum to unified DeadlineStatus
      if (data?.eintraege && Array.isArray(data.eintraege)) {
        data.eintraege = data.eintraege.map((e: Record<string, unknown>) => ({
          ...e,
          status: normalizeFristenbuchStatus(String(e.status ?? "ok")),
        }));
      }

      // FALLBACK: If the engine's fristenbuch is empty, merge in deadlines
      // from legal_case pages (same source-3 logic as /api/legal/fristen).
      const engineCount = data?.zusammenfassung?.gesamt ?? data?.eintraege?.length ?? 0;
      if (engineCount === 0) {
        try {
          const caseFilter = query.case ?? undefined;
          // Was a single fetch with limit=300 against an engine that caps
          // listings at 200 — a Kanzlei with more than 200 cases silently
          // lost deadlines from this fallback with no error surfaced.
          // listEnginePages pages past that cap (see
          // engine-list-cap-and-tombstones).
          const casePages = await listEnginePages(ctx.headers, "legal_case", 2000);
          const eintraege: Record<string, unknown>[] = [];
          for (const page of casePages) {
            if (caseFilter && (page as { slug?: string }).slug !== caseFilter) continue;
            const fm = ((page as { frontmatter?: Record<string, unknown> }).frontmatter ?? {}) as {
              deadlines?: Array<{ title?: string; due_date?: string; law?: string }>;
            };
            for (const d of fm.deadlines ?? []) {
              if (!d.due_date) continue;
              const status = computeDeadlineStatus(d.due_date);
              eintraege.push({
                case_slug: (page as { slug?: string }).slug,
                frist: d.title || "Frist",
                datum: d.due_date,
                rechtsgrundlage: d.law ?? "",
                status:
                  status === "overdue" ? "ueberfaellig" : status === "critical" ? "kritisch" : "ok",
              });
            }
          }
          if (eintraege.length > 0) {
            data.eintraege = eintraege;
            const overdue = eintraege.filter((e) => e.status === "ueberfaellig").length;
            const critical = eintraege.filter((e) => e.status === "kritisch").length;
            data.zusammenfassung = {
              gesamt: eintraege.length,
              ueberfaellig: overdue,
              kritisch: critical,
              vorfrist: 0,
              ok: eintraege.length - overdue - critical,
              unparsebar: 0,
            };
          }
        } catch {
          // Fallback failed — return what we have from the engine
        }
      }

      if (data?.zusammenfassung && typeof data.zusammenfassung === "object") {
        const z = data.zusammenfassung as Record<string, number>;
        data.zusammenfassung = {
          gesamt: z.gesamt ?? 0,
          overdue: z.ueberfaellig ?? z.overdue ?? 0,
          critical: z.kritisch ?? z.critical ?? 0,
          vorfrist: z.vorfrist ?? 0,
          pending: z.ok ?? z.pending ?? 0,
          warning: z.warning ?? 0,
          done: z.done ?? 0,
          unparsebar: z.unparsebar ?? 0,
        };
      }
      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        { error: "fristenbuch_unavailable", message: "Engine not reachable" },
        { status: 502 }
      );
    }
  }
);
