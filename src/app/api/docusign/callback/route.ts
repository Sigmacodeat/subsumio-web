import { z } from "zod";
import { getStore } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";
import { externalFetchTimeout } from "@/lib/retry";
import { env } from "@/lib/env";
import { timingSafeCompare } from "@/lib/crypto-utils";

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(),
});

const DOCUSIGN_OAUTH_STATE_COOKIE = "docusign_oauth_state";

export const GET = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    query: callbackQuerySchema,
    skipCsrf: true,
  },
  async (ctx, _body, query, req) => {
    if (query.error) {
      return apiError("oauth_denied", query.error, 400);
    }
    if (!query.code) {
      return apiError("code_required", "Authorization code required", 400);
    }

    // OAuth CSRF protection: the state we minted in /api/docusign/auth is
    // stored in an httpOnly cookie. DocuSign must return the same value.
    const cookieState = req.cookies.get(DOCUSIGN_OAUTH_STATE_COOKIE)?.value ?? "";
    const queryState = query.state ?? "";
    if (!cookieState || !queryState || !timingSafeCompare(queryState, cookieState)) {
      return apiError(
        "state_mismatch",
        "OAuth state mismatch. Please restart the connection.",
        403
      );
    }

    const ik = env("DOCUSIGN_INTEGRATION_KEY");
    const secret = env("DOCUSIGN_SECRET_KEY");
    if (!ik || !secret) {
      return apiError("docusign_not_configured", "Docusign not configured", 503);
    }

    const redirectUri = `${env("NEXT_PUBLIC_APP_URL") || "https://subsum.eu"}/api/docusign/callback`;
    const tokenRes = await fetch("https://account-d.docusign.com/oauth/token", {
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
    });
    const data = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      account_id?: string;
      base_uri?: string;
    };
    if (!tokenRes.ok) {
      return apiError(
        data.error || "token_exchange_failed",
        data.error || "Token exchange failed",
        400
      );
    }

    if (!data.access_token || !data.expires_in) {
      return apiError("incomplete_token_response", "Incomplete token response", 502);
    }

    const store = getStore();
    await store.update(ctx.user.id, {
      docusignAccessToken: data.access_token,
      docusignRefreshToken: data.refresh_token ?? null,
      docusignTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    });

    return Response.json({ ok: true, connected: true });
  }
);
