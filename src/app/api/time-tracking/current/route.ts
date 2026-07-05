import { NextResponse } from "next/server";
import { createHandler, type HandlerContext } from "@/lib/api-handler";
import { z } from "zod";
import {
  getCurrentActivity,
  setCurrentActivity,
  stopCurrentActivity,
  type ActivityType,
} from "@/lib/time-tracking";
import { broadcastTimeActivityStarted, broadcastTimeActivityStopped } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

const startActivitySchema = z.object({
  activity_type: z.enum([
    "document",
    "query",
    "case",
    "meeting",
    "email",
    "phone",
    "review",
    "other",
  ]),
  description: z.string(),
  case_slug: z.string().optional(),
});

/**
 * GET /api/time-tracking/current
 *
 * Get current activity for the authenticated user.
 */
async function getCurrentActivityHandler(ctx: HandlerContext) {
  const current = await getCurrentActivity(ctx.brainId, ctx.user.id);
  return NextResponse.json({ current });
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  getCurrentActivityHandler
);

/**
 * POST /api/time-tracking/start
 *
 * Start tracking a new activity (stops any current activity first).
 */
async function startActivityHandler(
  ctx: HandlerContext,
  body: z.infer<typeof startActivitySchema>
) {
  // Stop any current activity first
  const existingEntryId = await stopCurrentActivity(ctx.brainId, ctx.user.id);
  if (existingEntryId) {
    broadcastTimeActivityStopped(ctx.brainId, { userId: ctx.user.id, entryId: existingEntryId });
  }

  // Start new activity
  await setCurrentActivity({
    user_id: ctx.user.id,
    brain_id: ctx.brainId,
    activity_type: body.activity_type as ActivityType,
    description: body.description,
    case_slug: body.case_slug,
    started_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });

  broadcastTimeActivityStarted(ctx.brainId, {
    userId: ctx.user.id,
    activityType: body.activity_type,
    description: body.description,
  });

  return NextResponse.json({ ok: true, started: true });
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: startActivitySchema,
  },
  startActivityHandler
);
