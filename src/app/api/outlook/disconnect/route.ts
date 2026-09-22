import { createHandler } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import { disconnectMs365 } from "@/lib/msgraph-user";

export const dynamic = "force-dynamic";

/** Trennt die persönliche Outlook-Kalender-Verbindung (Tokens werden gelöscht). */
export const POST = createHandler(
  {
    action: "settings.write",
    audit: (ctx) => ({
      action: "workflow.update" as const,
      entityType: "ms365_connection",
      entityId: ctx.user.id,
      details: { op: "disconnect" },
    }),
  },
  async (ctx) => {
    await disconnectMs365(ctx.user.id);
    return apiSuccess({ connected: false });
  }
);
