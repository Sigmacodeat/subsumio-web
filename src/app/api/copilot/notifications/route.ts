import { NextResponse } from "next/server";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  getCopilotNotifications,
  generateCopilotNotifications,
  dismissCopilotNotification,
} from "@/lib/copilot-notifications";

const notifPostSchema = z.object({
  action: z.enum(["dismiss", "refresh"]).optional(),
  notificationId: z.string().max(200).optional(),
  lang: z.enum(["de", "en"]).optional(),
});

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, query) => {
    const brainId = ctx.brainId;
    const userId = ctx.user.id;
    const isEn = query?.lang === "en";
    const refresh = query?.refresh === "true";

    try {
      const notifications = refresh
        ? await generateCopilotNotifications(brainId, userId, isEn)
        : await getCopilotNotifications(brainId, userId, isEn);

      return NextResponse.json({ notifications });
    } catch (err) {
      console.error(
        "[copilot/notifications] GET failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to load notifications", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: notifPostSchema,
    audit: (ctx, body) => {
      const b = body as { action?: string; notificationId?: string; lang?: string };
      return {
        action: "copilot.notification_dismiss" as const,
        entityType: "notification",
        entityId: b.notificationId,
        details: {
          subAction: b.action,
          notificationId: b.notificationId,
          lang: b.lang,
          user: ctx.user.email,
        },
      };
    },
  },
  async (ctx, body) => {
    const brainId = ctx.brainId;
    const userId = ctx.user.id;
    const { action, notificationId, lang } = body as {
      action?: string;
      notificationId?: string;
      lang?: string;
    };

    try {
      if (action === "dismiss" && notificationId) {
        await dismissCopilotNotification(notificationId, userId, brainId);
        return NextResponse.json({ ok: true });
      }

      if (action === "refresh") {
        const isEn = lang === "en";
        const notifications = await generateCopilotNotifications(brainId, userId, isEn);
        return NextResponse.json({ notifications });
      }

      return apiError("bad_request", "Invalid action", 400);
    } catch (err) {
      console.error(
        "[copilot/notifications] POST failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to process action", 500);
    }
  }
);
