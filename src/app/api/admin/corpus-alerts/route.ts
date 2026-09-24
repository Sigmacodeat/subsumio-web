import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import {
  countUnreadCorpusDeltaNotifications,
  listCorpusDeltaNotifications,
  markAllCorpusDeltaNotificationsRead,
} from "@/lib/comments";

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
    action: "platform.operator",
    query: querySchema,
  },
  async (_ctx, _body, query) => {
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 50, 200) : 50;
    const [notifications, unreadCount] = await Promise.all([
      listCorpusDeltaNotifications({
        unreadOnly: query.unread === "true",
        limit,
      }),
      // A real COUNT(*), not the length of the limit-capped list above — the
      // ops badge calls this route with limit=1, so deriving unreadCount
      // from the returned array could never show more than 1.
      countUnreadCorpusDeltaNotifications(),
    ]);
    return apiSuccess({
      notifications,
      count: notifications.length,
      unreadCount,
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
    action: "platform.operator",
    audit: (_ctx, _body) => ({
      action: "corpus_alerts.mark_read" as const,
      entityType: "corpus_alert",
      details: { scope: "all" },
    }),
  },
  async () => {
    const marked = await markAllCorpusDeltaNotificationsRead();
    return apiSuccess({ marked });
  }
);
