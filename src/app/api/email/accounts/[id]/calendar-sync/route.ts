import { createHandler, apiError } from "@/lib/api-handler";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { getMailAccount } from "@/lib/email/imap-accounts";
import { syncAccountCalendar } from "@/lib/calendar/graph-user-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Manual "Jetzt synchronisieren" for one OAuth mailbox's calendar. */
export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    audit: () => ({ action: "email.account_update" as const, entityType: "mail_account" }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const account = await getMailAccount(mailboxScopeFor(ctx, req).brainId, id);
    if (!account) return apiError("not_found", "Postfach nicht gefunden", 404);
    if (account.authType !== "oauth")
      return apiError(
        "calendar_sync_oauth_only",
        "Kalender-Sync ist nur für OAuth-Postfächer (Microsoft 365) verfügbar",
        400
      );
    if (!account.calendarSync)
      return apiError(
        "calendar_sync_disabled",
        "Kalender-Synchronisation ist für dieses Postfach deaktiviert",
        400
      );
    try {
      const result = await syncAccountCalendar(account);
      return Response.json({ ok: true, result });
    } catch (e) {
      return apiError(
        "calendar_sync_failed",
        e instanceof Error ? e.message : "Kalender-Sync fehlgeschlagen",
        502
      );
    }
  }
);
