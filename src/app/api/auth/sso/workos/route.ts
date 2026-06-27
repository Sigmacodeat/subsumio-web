import { NextResponse } from "next/server";
import { getAuthorizationUrl, isConfigured } from "@/lib/workos";
import { createPublicHandler } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SSO_STATE_COOKIE = "sb_sso_state";
const SSO_STATE_TTL = 10 * 60; // 10 minutes

const ssoWorkosSchema = z.object({
  provider: z.enum(["MicrosoftOAuth", "GoogleOAuth", "SAML"]).optional(),
  orgId: z.string().optional(),
});

/**
 * GET /api/auth/sso/workos?provider=MicrosoftOAuth&orgId=...
 * Startet den WorkOS SSO-Autorisierungsflow.
 * Setzt ein httpOnly Cookie mit dem State-Token für CSRF-Schutz im Callback.
 */
export const GET = createPublicHandler(
  {
    query: ssoWorkosSchema,
  },
  async (req, _body, query) => {
    if (!isConfigured()) {
      return Response.json({ configured: false }, { status: 200 });
    }

    const { provider, orgId: organizationId } = query;

    const redirectUri = `${env("NEXT_PUBLIC_APP_URL") || "https://subsum.eu"}/api/auth/sso/callback`;

    // State token to prevent CSRF — stored as httpOnly cookie for callback validation
    const state = crypto.randomUUID();

    const authUrl = getAuthorizationUrl({
      redirectUri,
      state,
      provider,
      organizationId,
    });

    const res = NextResponse.json({ authUrl, state });
    res.cookies.set(SSO_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env("NODE_ENV") === "production",
      maxAge: SSO_STATE_TTL,
      path: "/",
    });
    return res;
  }
);
