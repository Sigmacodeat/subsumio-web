import { createHandler, apiError } from "@/lib/api-handler";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { getMailAccount } from "@/lib/email/imap-accounts";
import { syncImapAccount } from "@/lib/email/imap-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** "Jetzt abrufen" — one sync run for this mailbox. */
export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "heavy",
    audit: () => ({ action: "email.account_sync" as const, entityType: "mail_account" }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const account = await getMailAccount(mailboxScopeFor(ctx, req).brainId, id);
    if (!account) return apiError("not_found", "Postfach nicht gefunden", 404);
    const result = await syncImapAccount(account);
    if (result.error) return apiError("imap_sync_failed", result.error, 502);
    return Response.json({ result });
  }
);
