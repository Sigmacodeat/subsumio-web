import { createHandler } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import { getStore } from "@/lib/auth/store";
import { isDelegatedMs365Configured, isMs365Connected } from "@/lib/msgraph-user";

export const dynamic = "force-dynamic";

/** Verbindungsstatus des persönlichen Outlook-Kalenders (WP-4.19). */
export const GET = createHandler({ action: "settings.read" }, async (ctx) => {
  if (!isDelegatedMs365Configured()) {
    return apiSuccess({ configured: false, connected: false, reason: "not_configured" });
  }
  const user = await getStore().getById(ctx.user.id);
  const connected = user ? isMs365Connected(user) : false;
  const needsReconnect = !connected && user?.ms365SyncError === "needs_reconnect";
  return apiSuccess({
    configured: true,
    connected,
    ...(needsReconnect ? { reason: "needs_reconnect" } : {}),
    email: user?.ms365UserEmail ?? null,
    lastSyncAt: user?.ms365LastSyncAt ?? null,
  });
});
