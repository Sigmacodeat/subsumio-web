import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { getAuthUrl } from "@/lib/docusign";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const DOCUSIGN_OAUTH_STATE_COOKIE = "docusign_oauth_state";
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes, DocuSign OAuth round-trip

export const GET = createHandler(
  {
    action: "settings.read",
  },
  async () => {
    try {
      const redirectUri = `${env("NEXT_PUBLIC_APP_URL") || "https://subsum.eu"}/api/docusign/callback`;
      const state = randomBytes(32).toString("hex");
      const authUrl = getAuthUrl(redirectUri, state);

      const res = NextResponse.json({ authUrl });
      res.cookies.set(DOCUSIGN_OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: "lax",
        secure: env("NODE_ENV") === "production",
        maxAge: STATE_TTL_SECONDS,
        path: "/api/docusign/callback",
      });
      return res;
    } catch {
      return Response.json({ error: "docusign_not_configured" }, { status: 503 });
    }
  }
);
