import { NextResponse } from "next/server";
import { createHandler, type HandlerContext } from "@/lib/api-handler";
import { updateActivityHeartbeat } from "@/lib/time-tracking";

export const dynamic = "force-dynamic";

/**
 * POST /api/time-tracking/heartbeat
 *
 * Update last_activity_at for current activity (heartbeat).
 * Called periodically by client to keep activity alive.
 */
async function heartbeatHandler(ctx: HandlerContext) {
  await updateActivityHeartbeat(ctx.brainId, ctx.user.id);
  return NextResponse.json({ ok: true, heartbeat: true });
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
  },
  heartbeatHandler
);
