import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — Liveness probe.
 *
 * Lightweight check that the Next.js process is running and can respond.
 * Does NOT check external dependencies (engine, auth store, etc.) — use
 * /api/readiness for that.
 *
 * Always returns 200 if the process can answer at all.
 * Used by load-balancers and uptime monitors that need to know the
 * process is alive, not whether every dependency is healthy.
 */
export async function GET(_req: NextRequest) {
  return Response.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
