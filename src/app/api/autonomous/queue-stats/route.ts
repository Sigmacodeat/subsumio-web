import { NextResponse } from "next/server";
import { createHandler, type HandlerContext } from "@/lib/api-handler";
import { getQueueStats } from "@/lib/autonomous-queue";

export const dynamic = "force-dynamic";

/**
 * GET /api/autonomous/queue-stats
 *
 * Returns statistics about the autonomous task queue.
 */
async function queueStatsHandler(ctx: HandlerContext) {
  // Scope to the caller's own brain — see the note in ../tasks/route.ts.
  const stats = await getQueueStats(ctx.brainId);
  return NextResponse.json(stats);
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  queueStatsHandler
);
