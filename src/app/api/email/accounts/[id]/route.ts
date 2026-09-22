import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import {
  deleteMailAccount,
  getMailAccount,
  setCalendarSync,
  setMailAccountEnabled,
} from "@/lib/email/imap-accounts";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  calendarSync: z.boolean().optional(),
});

export const PATCH = createHandler(
  {
    action: "settings.write",
    admin: true,
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "email.account_update" as const,
      entityType: "mail_account",
      details: { enabled: body.enabled, calendarSync: body.calendarSync },
    }),
  },
  async (ctx, body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const brainId = mailboxScopeFor(ctx, req).brainId;
    let account =
      body.enabled === undefined
        ? await getMailAccount(brainId, id)
        : await setMailAccountEnabled(brainId, id, body.enabled);
    if (!account) return apiError("not_found", "Postfach nicht gefunden", 404);
    if (body.calendarSync !== undefined) {
      const updated = await setCalendarSync(brainId, id, body.calendarSync);
      if (!updated)
        return apiError(
          "calendar_sync_oauth_only",
          "Kalender-Sync ist nur für OAuth-Postfächer (Microsoft 365) verfügbar",
          400
        );
      account = updated;
    }
    return Response.json({ account });
  }
);

/** Disconnect: removes the stored credentials. Already imported mail stays in the matters. */
export const DELETE = createHandler(
  {
    action: "settings.write",
    admin: true,
    rateTier: "standard",
    audit: () => ({ action: "email.account_disconnect" as const, entityType: "mail_account" }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const removed = await deleteMailAccount(mailboxScopeFor(ctx, req).brainId, id);
    if (!removed) return apiError("not_found", "Postfach nicht gefunden", 404);
    return Response.json({ ok: true });
  }
);
