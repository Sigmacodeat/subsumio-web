import { NextResponse } from "next/server";
import { createHandler, type HandlerContext } from "@/lib/api-handler";
import { stopCurrentActivity } from "@/lib/time-tracking";
import { broadcastTimeActivityStopped } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

/**
 * POST /api/time-tracking/stop
 *
 * Stop current activity and create time entry.
 */
async function stopActivityHandler(ctx: HandlerContext) {
  const entryId = await stopCurrentActivity(ctx.brainId, ctx.user.id);

  if (entryId) {
    broadcastTimeActivityStopped(ctx.brainId, { userId: ctx.user.id, entryId });
    return NextResponse.json({ ok: true, stopped: true, entryId });
  }

  return NextResponse.json({ ok: true, stopped: false, message: "no_current_activity" });
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
  },
  stopActivityHandler
);
