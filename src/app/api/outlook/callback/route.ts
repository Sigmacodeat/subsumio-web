import { z } from "zod";
import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { env } from "@/lib/env";
import { exchangeMs365Code, fetchMs365Me, isDelegatedMs365Configured } from "@/lib/msgraph-user";
import { MS365_OAUTH_STATE_COOKIE } from "@/app/api/outlook/connect/route";

export const dynamic = "force-dynamic";

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const GET = createHandler(
  { action: "settings.read", query: callbackQuerySchema, skipCsrf: true },
  async (ctx, _body, query, req) => {
    // The browser arrives here from Microsoft's consent screen: every outcome
    // leads back to the settings (Outlook card) with a result the page shows.
    const settingsUrl = `${env("NEXT_PUBLIC_APP_URL") || ""}/dashboard/settings?tab=kanzlei`;
    const back = (result: string) => {
      const res = NextResponse.redirect(`${settingsUrl}&outlook=${encodeURIComponent(result)}`);
      res.cookies.set(MS365_OAUTH_STATE_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: env("NODE_ENV") === "production",
        maxAge: 0,
        path: "/api/outlook/callback",
      });
      return res;
    };
    if (query.error) return back("denied");
    if (!query.code) return back("code_required");
    if (!isDelegatedMs365Configured()) return back("not_configured");

    // OAuth-CSRF: state aus dem Connect-Cookie muss mit dem Query-State
    // übereinstimmen (timing-safe).
    const cookieState = req.cookies.get(MS365_OAUTH_STATE_COOKIE)?.value ?? "";
    const queryState = query.state ?? "";
    if (!cookieState || !queryState || !timingSafeCompare(queryState, cookieState)) {
      return back("state_mismatch");
    }

    const tokens = await exchangeMs365Code(query.code).catch(() => null);
    if (!tokens) return back("token_exchange_failed");

    const email = await fetchMs365Me(tokens.access_token).catch(() => undefined);
    await getStore().update(ctx.user.id, {
      ms365AccessToken: tokens.access_token,
      ms365RefreshToken: tokens.refresh_token ?? null,
      ms365TokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      ms365UserEmail: email ?? null,
      ms365SyncError: null,
      ms365SyncErrorAt: null,
    });

    return back("connected");
  }
);
