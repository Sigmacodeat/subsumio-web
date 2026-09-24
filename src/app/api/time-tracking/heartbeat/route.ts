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
  await updateActivityHeartbeat(ctx.brainId, ctx.user.id, ctx.headers);
  return NextResponse.json({ ok: true, heartbeat: true });
}

// No `audit` here on purpose: the widget heartbeats every 60 s while a timer
// runs, which would flood the audit log with ~1.4k meaningless rows per
// user-day. Start/stop are audited; a keep-alive is not an auditable act.
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
  },
  heartbeatHandler
);
