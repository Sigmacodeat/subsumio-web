import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createHandler, apiError } from "@/lib/api-handler";
import { env } from "@/lib/env";
import {
  buildMailOAuthUrl,
  isMailOAuthConfigured,
  isMailOAuthProvider,
} from "@/lib/email/mail-oauth";

export const dynamic = "force-dynamic";

const STATE_TTL_SECONDS = 10 * 60;

/** Step 1: hand the admin the provider's sign-in URL; the state lives in an httpOnly cookie. */
export const GET = createHandler(
  { action: "settings.write", admin: true, rateTier: "standard" },
  async (_ctx, _body, _query, req) => {
    const { provider } = await (req as unknown as { params: Promise<{ provider: string }> }).params;
    if (!isMailOAuthProvider(provider))
      return apiError("unknown_provider", "Unbekannter Anbieter", 404);
    if (!isMailOAuthConfigured(provider)) {
      return apiError(
        "mail_oauth_not_configured",
        "Die Anmeldung über diesen Anbieter ist noch nicht eingerichtet.",
        503
      );
    }
    const state = randomBytes(32).toString("hex");
    const res = NextResponse.json({ authUrl: buildMailOAuthUrl(provider, state) });
    res.cookies.set(`mail_oauth_state_${provider}`, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env("NODE_ENV") === "production",
      maxAge: STATE_TTL_SECONDS,
      path: `/api/email/oauth/${provider}/callback`,
    });
    return res;
  }
);
