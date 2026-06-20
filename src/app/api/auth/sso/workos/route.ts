import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl, isConfigured } from "@/lib/workos";

export const dynamic = "force-dynamic";

const SSO_STATE_COOKIE = "sb_sso_state";
const SSO_STATE_TTL = 10 * 60; // 10 minutes

/**
 * GET /api/auth/sso/workos?provider=MicrosoftOAuth&orgId=...
 * Startet den WorkOS SSO-Autorisierungsflow.
 * Setzt ein httpOnly Cookie mit dem State-Token für CSRF-Schutz im Callback.
 */
export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return Response.json({ error: "sso_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider") as "MicrosoftOAuth" | "GoogleOAuth" | "SAML" | undefined;
  const organizationId = searchParams.get("orgId") || undefined;

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu"}/api/auth/sso/callback`;

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
    secure: process.env.NODE_ENV === "production",
    maxAge: SSO_STATE_TTL,
    path: "/",
  });
  return res;
}
