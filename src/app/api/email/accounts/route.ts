import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { createMailAccount, listMailAccounts } from "@/lib/email/imap-accounts";
import { syncImapAccount, testImapConnection } from "@/lib/email/imap-sync";
import { isMailOAuthConfigured } from "@/lib/email/mail-oauth";
import { logger } from "@/lib/logger";

const log = logger("api/email/accounts");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const host = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .regex(/^[a-z0-9.-]+$/i, "invalid_host");

const accountSchema = z.object({
  label: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(254),
  imapHost: host,
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapSecure: z.boolean().default(true),
  imapUser: z.string().trim().min(1).max(254),
  imapPassword: z.string().min(1).max(1024),
  folder: z.string().trim().max(200).optional(),
  smtpHost: host.optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().trim().max(254).optional().nullable(),
  smtpPassword: z.string().max(1024).optional().nullable(),
});

/** Connected mailboxes of the firm — never includes passwords. */
export const GET = createHandler(
  { action: "settings.read", rateTier: "standard" },
  async (ctx, _body, _query, req) => {
    try {
      const accounts = await listMailAccounts(mailboxScopeFor(ctx, req).brainId);
      return Response.json({
        accounts,
        oauthProviders: {
          microsoft: isMailOAuthConfigured("microsoft"),
          google: isMailOAuthConfigured("google"),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg === "mail_accounts_database_not_configured" ? 503 : 500;
      log.error("list failed", msg);
      return apiError("load_failed", "Postfächer konnten nicht geladen werden", status);
    }
  }
);

/** Connect a mailbox: the login is verified before anything is stored. */
export const POST = createHandler(
  {
    action: "settings.write",
    admin: true,
    rateTier: "heavy",
    body: accountSchema,
    audit: (_ctx, body) => ({
      action: "email.account_connect" as const,
      entityType: "mail_account",
      details: { email: body.email, imap_host: body.imapHost, smtp: Boolean(body.smtpHost) },
    }),
  },
  async (ctx, body, _query, req) => {
    const scope = mailboxScopeFor(ctx, req);
    const test = await testImapConnection(
      {
        host: body.imapHost,
        port: body.imapPort,
        secure: body.imapSecure,
        user: body.imapUser,
        password: body.imapPassword,
      },
      body.folder || "INBOX"
    );
    if (!test.ok) return apiError("imap_login_failed", test.error, 422);

    try {
      const account = await createMailAccount(scope.brainId, ctx.user.id, body);
      // First sync in the background; the cron job continues from there.
      void syncImapAccount(account).catch((err) =>
        log.warn("initial sync failed", err instanceof Error ? err.message : String(err))
      );
      return Response.json({ account, messagesInFolder: test.messages }, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("create failed", msg);
      const status = msg === "mail_accounts_database_not_configured" ? 503 : 500;
      return apiError("save_failed", "Postfach konnte nicht gespeichert werden", status);
    }
  }
);
