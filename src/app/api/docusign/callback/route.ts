import { z } from "zod";
import { DOCUSIGN_OAUTH_HOST } from "@/lib/docusign";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { createHandler } from "@/lib/api-handler";
import { externalFetchTimeout } from "@/lib/retry";
import { env } from "@/lib/env";
import { timingSafeCompare } from "@/lib/crypto-utils";

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(),
});

const DOCUSIGN_OAUTH_STATE_COOKIE = "docusign_oauth_state";

/**
 * DocuSign sends the browser here after the consent screen: every outcome
 * leads back to the settings page (`?docusign=<result>`), never to a raw
 * JSON page. Same role as /api/docusign/auth — each user connects their own
 * DocuSign account.
 */
function backToSettings(result: string): NextResponse {
  const url = `${env("NEXT_PUBLIC_APP_URL") || ""}/dashboard/settings?docusign=${encodeURIComponent(result)}`;
  const res = NextResponse.redirect(url);
  res.cookies.set(DOCUSIGN_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: env("NODE_ENV") === "production",
    maxAge: 0,
    path: "/api/docusign/callback",
  });
  return res;
}

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    query: callbackQuerySchema,
    skipCsrf: true,
  },
  async (ctx, _body, query, req) => {
    if (query.error) return backToSettings("denied");
    if (!query.code) return backToSettings("code_required");

    // OAuth CSRF protection: the state we minted in /api/docusign/auth is
    // stored in an httpOnly cookie. DocuSign must return the same value.
    const cookieState = req.cookies.get(DOCUSIGN_OAUTH_STATE_COOKIE)?.value ?? "";
    const queryState = query.state ?? "";
    if (!cookieState || !queryState || !timingSafeCompare(queryState, cookieState)) {
      return backToSettings("state_mismatch");
    }
    const ik = env("DOCUSIGN_INTEGRATION_KEY");
    const secret = env("DOCUSIGN_SECRET_KEY");
    if (!ik || !secret) return backToSettings("not_configured");

    const redirectUri = `${env("NEXT_PUBLIC_APP_URL") || "https://subsum.io"}/api/docusign/callback`;
    const tokenRes = await fetch(`https://${DOCUSIGN_OAUTH_HOST}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: query.code,
        client_id: ik,
        client_secret: secret,
        redirect_uri: redirectUri,
      }),
      signal: externalFetchTimeout(),
    }).catch(() => null);
    if (!tokenRes) return backToSettings("token_exchange_failed");
    const data = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      account_id?: string;
      base_uri?: string;
    };
    if (!tokenRes.ok || !data.access_token || !data.expires_in) {
      return backToSettings("token_exchange_failed");
    }

    const store = getStore();
    await store.update(ctx.user.id, {
      docusignAccessToken: data.access_token,
      docusignRefreshToken: data.refresh_token ?? null,
      docusignTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    });

    return backToSettings("connected");
  }
);
