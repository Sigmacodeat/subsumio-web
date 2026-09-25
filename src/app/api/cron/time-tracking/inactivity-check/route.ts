import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import {
  getCurrentActivity,
  stopCurrentActivity,
  timerExceededMaxDuration,
  timerMaxDurationEnd,
} from "@/lib/time-tracking";
import { broadcastTimeActivityStopped } from "@/lib/realtime-bus";
import { logAudit } from "@/lib/audit";
import { getStore } from "@/lib/auth/store";
import { firmBrainIdFor } from "@/lib/engine";
import { logger } from "@/lib/logger";

const log = logger("time-tracking-inactivity");

export const dynamic = "force-dynamic";

const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * POST /api/cron/time-tracking/inactivity-check
 *
 * Cron job that checks for inactive users and stops their time tracking.
 * Runs hourly (server crontab) and stops timers without a heartbeat for
 * > 30 minutes or past the maximum duration.
 */
export async function POST(req: NextRequest) {
  const authError = await validateCronAuth(req);
  if (authError) return authError;

  try {
    const users = await getActiveUsers();
    let stoppedCount = 0;

    for (const { userId, brainId } of users) {
      const current = await getCurrentActivity(brainId, userId);
      if (!current) continue;

      const lastActivity = new Date(current.last_activity_at);
      const now = new Date();
      const inactiveMs = now.getTime() - lastActivity.getTime();
      // Hard cap first: a timer with a continuous heartbeat (tab left open
      // overnight) is never "inactive", so the threshold below alone would
      // let it run — and bill — forever.
      const overCap = timerExceededMaxDuration(current, now);

      if (overCap || inactiveMs > INACTIVITY_THRESHOLD_MS) {
        // Stop at the cap boundary or the last real heartbeat — ending at
        // `now` would bill the idle tail (30+ min plus cron delay, resp.
        // everything past the cap) to the client.
        const endedAt = overCap ? timerMaxDurationEnd(current) : current.last_activity_at;
        const entryId = await stopCurrentActivity(brainId, userId, undefined, endedAt);
        if (entryId) {
          stoppedCount++;
          broadcastTimeActivityStopped(brainId, { userId, entryId });
          if (overCap) {
            void logAudit("timer.max_duration", "time_entry", {
              brainId,
              userId,
              entityId: entryId,
              details: {
                started_at: current.started_at,
                capped_at: endedAt,
                case_slug: current.case_slug,
                description: current.description,
              },
            });
            log.info("Stopped over-cap activity", {
              userId,
              startedAt: current.started_at,
              cappedAt: endedAt,
            });
          } else {
            log.info("Stopped inactive activity", {
              userId,
              inactiveMinutes: Math.floor(inactiveMs / 60000),
            });
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      checked: users.length,
      stopped: stoppedCount,
    });
  } catch (err) {
    log.error("Inactivity check failed", { error: String(err) });
    return NextResponse.json(
      {
        error: "inactivity_check_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * Active users with the brain their timer lives in. A timer is started in
 * the firm's brain (ctx.brainId); for a firm member that is the firm's
 * brain, not the unused personal workspace `user.brainId` from signup.
 * Suspended firms (null) are skipped; each (brain, user) is checked once.
 */
async function getActiveUsers(): Promise<Array<{ userId: string; brainId: string }>> {
  try {
    const store = getStore();
    const users = await store.list();
    const out: Array<{ userId: string; brainId: string }> = [];
    const seen = new Set<string>();
    for (const u of users) {
      if (u.deactivatedAt || !u.brainId) continue;
      const brainId = await firmBrainIdFor(u);
      if (!brainId) continue;
      const key = `${brainId}\u0000${u.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ userId: u.id, brainId });
    }
    return out;
  } catch (err) {
    log.error("Failed to list active users", { error: String(err) });
    return [];
  }
}

// The server crontab calls every job with a plain GET (curl -fsS).
export const GET = POST;
