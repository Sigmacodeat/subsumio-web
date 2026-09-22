/**
 * Admin API for the public live-demo analytics (/ops/demo).
 *
 * GET /api/admin/demo?range=24h|7d|30d|90d  — funnel, summary + deltas,
 *      segments (persona/jurisdiction/ref), timeseries, capacity, recent
 *      sessions and gate leads.
 * GET /api/admin/demo?range=…&format=csv    — CSV export of the recent
 *      sessions table (capped at 5.000 rows).
 *
 * Operator-only (action: "platform.operator"). All data is first-party:
 * subsumio_demo_sessions + subsumio_demo_events, written by the demo API
 * routes themselves — no third-party analytics dependency, no PII beyond
 * the voluntarily submitted gate e-mail.
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import {
  DEMO_RANGE_KEYS,
  FUNNEL_STAGE_LABELS,
  computeRecent,
  demoRangeFor,
  getDemoAnalytics,
  getDemoCapacity,
  type DemoRangeKey,
} from "@/lib/demo/analytics";
import { loadDemoDataset, listDemoSessionEvents } from "@/lib/demo/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  range: z.enum(DEMO_RANGE_KEYS as [DemoRangeKey, ...DemoRangeKey[]]).default("7d"),
  format: z.enum(["json", "csv"]).default("json"),
  // Per-session drill-down: ordered event timeline for the expandable
  // recent-sessions rows (why did this visitor drop off?).
  sid: z
    .string()
    .regex(/^[a-z0-9-]{8,64}$/i)
    .optional(),
});

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = createHandler(
  {
    action: "platform.operator",
    rateTier: "standard",
    cacheMaxAge: 30,
    query: querySchema,
  },
  async (_ctx, _body, query) => {
    if (query.sid) {
      const events = await listDemoSessionEvents(query.sid);
      return Response.json({ ok: true, sid: query.sid, events });
    }
    if (query.format === "csv") {
      // Export the full session cohort of the range, not just the first 50.
      const range = demoRangeFor(query.range);
      const { sessions, events } = await loadDemoDataset({
        from: range.from,
        to: range.to,
      });
      const rows = computeRecent(sessions, events, 5000);
      const header = [
        "sid",
        "started_at",
        "duration_sec",
        "persona",
        "jurisdiction",
        "ref",
        "questions",
        "stage",
        "gate",
        "converted",
        "expired",
      ];
      const csv = [
        header.join(","),
        ...rows.map((r) =>
          [
            r.sid,
            r.startedAt,
            r.durationSec,
            r.persona,
            r.jurisdiction,
            r.ref,
            r.questionsUsed,
            r.stage ? FUNNEL_STAGE_LABELS[r.stage] : "",
            r.gate ? "1" : "0",
            r.converted ? "1" : "0",
            r.expired ? "1" : "0",
          ]
            .map(csvCell)
            .join(",")
        ),
      ].join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="subsumio-demo-${query.range}.csv"`,
        },
      });
    }

    const [analytics, capacity] = await Promise.all([
      getDemoAnalytics(query.range),
      getDemoCapacity(),
    ]);
    return Response.json({ ok: true, ...analytics, capacity });
  }
);
