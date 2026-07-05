import { NextResponse } from "next/server";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { normalizeFristenbuchStatus } from "@/lib/legal-deadlines";
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
