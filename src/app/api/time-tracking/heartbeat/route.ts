import { NextResponse } from "next/server";
import { createHandler, type HandlerContext } from "@/lib/api-handler";
import {
  getCurrentActivity,
  stopCurrentActivity,
  timerExceededMaxDuration,
  timerMaxDurationEnd,
  updateActivityHeartbeat,
} from "@/lib/time-tracking";
import { broadcastTimeActivityStopped } from "@/lib/realtime-bus";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/time-tracking/heartbeat
 *
 * Update last_activity_at for current activity (heartbeat).
 * Called periodically by client to keep activity alive.
 *
 * Erzwingt die harte Obergrenze (TIMER_MAX_DURATION_MS): ein Timer mit
 * kontinuierlichem Heartbeat läuft sonst unbegrenzt. Bei Überschreitung wird
 * der Timer an der Kappungsgrenze gestoppt (nicht `now` — die Zeit danach
 * ist nicht verrechenbar) und der Client bekommt 409.
 */
async function heartbeatHandler(ctx: HandlerContext) {
  const current = await getCurrentActivity(ctx.brainId, ctx.user.id, ctx.headers);

  if (current && timerExceededMaxDuration(current)) {
    const endedAt = timerMaxDurationEnd(current);
    const entryId = await stopCurrentActivity(ctx.brainId, ctx.user.id, ctx.headers, endedAt);
    broadcastTimeActivityStopped(ctx.brainId, {
      userId: ctx.user.id,
      entryId: entryId ?? undefined,
    });
    void logAudit("timer.max_duration", "time_entry", {
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      entityId: entryId ?? undefined,
      details: {
        started_at: current.started_at,
        capped_at: endedAt,
        case_slug: current.case_slug,
        description: current.description,
      },
    });
    return NextResponse.json(
      {
        error: "timer_max_duration",
        message:
          "Die Zeiterfassung wurde nach der Höchstdauer von 12 Stunden automatisch gestoppt.",
        entryId: entryId ?? null,
      },
      { status: 409 }
    );
  }

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
