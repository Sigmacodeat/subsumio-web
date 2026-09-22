import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { buildMs365AuthUrl, isDelegatedMs365Configured } from "@/lib/msgraph-user";

export const dynamic = "force-dynamic";

export const MS365_OAUTH_STATE_COOKIE = "ms365_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;

/** Startet den delegierten M365-OAuth-Flow (Kalender pro Nutzer, WP-4.19). */
export const GET = createHandler({ action: "settings.read" }, async () => {
  if (!isDelegatedMs365Configured()) {
    return Response.json({ error: "ms365_not_configured" }, { status: 503 });
  }
  const state = randomBytes(32).toString("hex");
  const res = NextResponse.json({ authUrl: buildMs365AuthUrl(state) });
  res.cookies.set(MS365_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env("NODE_ENV") === "production",
    maxAge: STATE_TTL_SECONDS,
    path: "/api/outlook/callback",
  });
  return res;
});
