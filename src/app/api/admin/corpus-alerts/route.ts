import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { listCorpusDeltaNotifications, markAllCorpusDeltaNotificationsRead } from "@/lib/comments";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  unread: z.string().optional(),
  limit: z.string().optional(),
});

/**
 * GET /api/admin/corpus-alerts?unread=true&limit=50
 *
 * Gibt Corpus-Delta-Notifications zurück (systemweit, nicht pro User).
 * Filter: unread=true → nur ungelesene.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (_ctx, _body, query) => {
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 50, 200) : 50;
    const notifications = await listCorpusDeltaNotifications({
      unreadOnly: query.unread === "true",
      limit,
    });
    return apiSuccess({
      notifications,
      count: notifications.length,
      unreadCount: notifications.filter((n) => !n.readAt).length,
    });
  }
);

/**
 * POST /api/admin/corpus-alerts
 *
 * Markiert alle Corpus-Delta-Notifications als gelesen.
 */
export const POST = createHandler(
  {
    action: "admin.*",
  },
  async () => {
    const marked = await markAllCorpusDeltaNotificationsRead();
    return apiSuccess({ marked });
  }
);
