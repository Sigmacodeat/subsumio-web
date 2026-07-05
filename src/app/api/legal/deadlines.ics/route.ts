import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  case: z.string().max(500).optional(),
});

/**
 * GET /api/legal/deadlines.ics — Proxies the Engine's ICS feed
 * (with Vorfrist-VALARM) to the same domain so clients can subscribe
 * without needing direct Engine access.
 *
 * The Engine's fristenbuch builds VEVENTs for each Frist plus a
 * Vorfrist VEVENT with VALARM (-P2D) for Kanzlei control dates.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    try {
      const caseSlug = query.case ?? undefined;
      const url = `${ENGINE_URL}/api/legal/deadlines.ics${caseSlug ? `?case=${encodeURIComponent(caseSlug)}` : ""}`;
      const res = await fetch(url, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return new Response("Failed to fetch ICS feed", { status: 502 });
      }
      const ics = await res.text();
      return new Response(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="fristenbuch.ics"',
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch {
      return new Response("ICS feed unavailable", { status: 502 });
    }
  }
);
