import { createHandler } from "@/lib/api-handler";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createDeadlineNotification,
} from "@/lib/comments";
import { z } from "zod";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      unread: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  async (ctx, _body, query, _req) => {
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 50, 200) : 50;
    const notifications = await listNotifications({
      userId: ctx.user.id,
      brainId: ctx.brainId,
      unreadOnly: query.unread === "true",
      limit,
    });
    return Response.json({ notifications, total: notifications.length });
  }
);

const markReadSchema = z.object({
  id: z.string().min(1, "id_required"),
});

const createDeadlineSchema = z.object({
  caseSlug: z.string().optional(),
  caseTitle: z.string().min(1, "caseTitle_required"),
  deadlineDate: z.string().min(1, "deadlineDate_required"),
  daysRemaining: z.number(),
  isOverdue: z.boolean(),
});

const batchDeadlineSchema = z.object({
  deadlines: z.array(createDeadlineSchema).min(1).max(50),
});

// Must come LAST in union — empty object schema matches anything
const markAllReadSchema = z.object({}).strict();

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    // Order matters: specific schemas first, catch-all (markAllRead) last
    body: z
      .union([markReadSchema, createDeadlineSchema, batchDeadlineSchema, markAllReadSchema])
      .optional(),
  },
  async (ctx, body, _query, _req) => {
    if (body && "id" in body && body.id) {
      await markNotificationRead(body.id, { userId: ctx.user.id, brainId: ctx.brainId });
      return Response.json({ ok: true });
    }
    if (body && "deadlines" in body && Array.isArray(body.deadlines)) {
      // Batch creation
      await Promise.all(
        body.deadlines.map((d) =>
          createDeadlineNotification({
            userId: ctx.user.id,
            brainId: ctx.brainId,
            caseSlug: d.caseSlug,
            caseTitle: d.caseTitle,
            deadlineDate: d.deadlineDate,
            daysRemaining: d.daysRemaining,
            isOverdue: d.isOverdue,
          })
        )
      );
      return Response.json({ ok: true, count: body.deadlines.length });
    }
    if (body && "caseTitle" in body && body.caseTitle) {
      await createDeadlineNotification({
        userId: ctx.user.id,
        brainId: ctx.brainId,
        caseSlug: body.caseSlug,
        caseTitle: body.caseTitle,
        deadlineDate: body.deadlineDate,
        daysRemaining: body.daysRemaining,
        isOverdue: body.isOverdue,
      });
      return Response.json({ ok: true });
    }
    // Mark all as read (empty body or markAll)
    await markAllNotificationsRead({ userId: ctx.user.id, brainId: ctx.brainId });
    return Response.json({ ok: true });
  }
);

const patchReadSchema = z.object({
  id: z.string().min(1, "id_required"),
});

export const PATCH = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: patchReadSchema,
  },
  async (ctx, body, _query, _req) => {
    await markNotificationRead(body.id, { userId: ctx.user.id, brainId: ctx.brainId });
    return Response.json({ ok: true });
  }
);
