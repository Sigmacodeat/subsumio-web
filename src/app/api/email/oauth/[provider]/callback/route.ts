import { z } from "zod";
import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { createOAuthMailAccount } from "@/lib/email/imap-accounts";
import { exchangeMailOAuthCode, isMailOAuthProvider } from "@/lib/email/mail-oauth";
import { syncImapAccount } from "@/lib/email/imap-sync";
import { logger } from "@/lib/logger";

const log = logger("api/email/oauth/callback");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

function back(result: string): NextResponse {
  const base = (env("NEXT_PUBLIC_APP_URL") || "").replace(/\/$/, "");
  return NextResponse.redirect(`${base}/dashboard/settings/email?verbunden=${result}`, 303);
}

/** Step 2: the provider sends the admin back with a code; we store the encrypted refresh token. */
export const GET = createHandler(
  {
    action: "settings.write",
    admin: true,
    rateTier: "standard",
    query: querySchema,
    skipCsrf: true,
    audit: () => ({ action: "email.account_connect" as const, entityType: "mail_account" }),
  },
  async (ctx, _body, query, req) => {
    const { provider } = await (req as unknown as { params: Promise<{ provider: string }> }).params;
    if (!isMailOAuthProvider(provider)) return back("fehler");
    if (query.error || !query.code) return back("abgebrochen");

    const cookieState = req.cookies.get(`mail_oauth_state_${provider}`)?.value ?? "";
    if (!cookieState || !query.state || !timingSafeCompare(query.state, cookieState)) {
      return back("fehler");
    }
    try {
      const tokens = await exchangeMailOAuthCode(provider, query.code);
      if (!tokens.email || !tokens.refreshToken) return back("unvollstaendig");
      const account = await createOAuthMailAccount(
        mailboxScopeFor(ctx, req).brainId,
        ctx.user.id,
        provider,
        tokens.email,
        tokens
      );
      void syncImapAccount(account).catch(() => undefined);
      const res = back("ok");
      res.cookies.delete(`mail_oauth_state_${provider}`);
      return res;
    } catch (err) {
      log.warn("oauth connect failed", err instanceof Error ? err.message : String(err));
      return back("fehler");
    }
  }
);
