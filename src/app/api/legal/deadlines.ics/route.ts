import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/legal/deadlines.ics — Proxies the Engine's ICS feed
 * (with Vorfrist-VALARM) to the same domain so clients can subscribe
 * without needing direct Engine access.
 *
 * The Engine's fristenbuch builds VEVENTs for each Frist plus a
 * Vorfrist VEVENT with VALARM (-P2D) for Kanzlei control dates.
 */
export async function GET(req: NextRequest) {
  const brainId = req.headers.get("x-subsumio-source") ?? "";
  if (!brainId) {
    return new Response("Missing brain context", { status: 400 });
  }

  try {
    const caseSlug = req.nextUrl.searchParams.get("case") ?? undefined;
    const url = `${ENGINE_URL}/api/legal/deadlines.ics${caseSlug ? `?case=${encodeURIComponent(caseSlug)}` : ""}`;
    const res = await fetch(url, {
      headers: engineHeadersForBrain(brainId),
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
