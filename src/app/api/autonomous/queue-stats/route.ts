import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { getQueueStats } from "@/lib/autonomous-queue";

export const dynamic = "force-dynamic";

/**
 * GET /api/autonomous/queue-stats
 *
 * Returns statistics about the autonomous task queue.
 */
async function queueStatsHandler() {
  // Use system brain for now — TODO: Resolve actual brainId from context
  const brainId = "system";
  const stats = await getQueueStats(brainId);
  return NextResponse.json(stats);
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  queueStatsHandler
);
