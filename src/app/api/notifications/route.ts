import { createHandler, apiError } from "@/lib/api-handler";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/comments";
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
    const notifications = await listNotifications({
      userId: ctx.user.id,
      brainId: ctx.brainId,
      unreadOnly: query.unread === "true",
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });
    return Response.json({ notifications, total: notifications.length });
  },
);

const markReadSchema = z.object({
  id: z.string().min(1, "id_required"),
});

const markAllReadSchema = z.object({});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: z.union([markReadSchema, markAllReadSchema]).optional(),
  },
  async (ctx, body, _query, _req) => {
    if (body && "id" in body && body.id) {
      await markNotificationRead(body.id);
      return Response.json({ ok: true });
    }
    // Mark all as read
    await markAllNotificationsRead({ userId: ctx.user.id, brainId: ctx.brainId });
    return Response.json({ ok: true });
  },
);
