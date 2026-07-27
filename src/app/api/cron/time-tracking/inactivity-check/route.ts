import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { getCurrentActivity, stopCurrentActivity } from "@/lib/time-tracking";
import { broadcastTimeActivityStopped } from "@/lib/realtime-bus";
import { getStore } from "@/lib/auth/store";
import { logger } from "@/lib/logger";

const log = logger("time-tracking-inactivity");

export const dynamic = "force-dynamic";

const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * POST /api/cron/time-tracking/inactivity-check
 *
 * Cron job that checks for inactive users and stops their time tracking.
 * Runs every 5 minutes to check if users have been inactive for > 30 minutes.
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

      if (inactiveMs > INACTIVITY_THRESHOLD_MS) {
        // Stop the activity
        const entryId = await stopCurrentActivity(brainId, userId);
        if (entryId) {
          stoppedCount++;
          broadcastTimeActivityStopped(brainId, { userId, entryId });
          log.info("Stopped inactive activity", {
            userId,
            inactiveMinutes: Math.floor(inactiveMs / 60000),
          });
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
 * Get list of active users from the user store.
 * Returns all users with a brainId (excluding deactivated accounts).
 */
async function getActiveUsers(): Promise<Array<{ userId: string; brainId: string }>> {
  try {
    const store = getStore();
    const users = await store.list();
    return users
      .filter((u) => !u.deactivatedAt && u.brainId)
      .map((u) => ({ userId: u.id, brainId: u.brainId }));
  } catch (err) {
    log.error("Failed to list active users", { error: String(err) });
    return [];
  }
}
