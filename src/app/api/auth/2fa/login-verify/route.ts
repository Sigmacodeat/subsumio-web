import { NextResponse } from "next/server";
import { getStore, toPublic } from "@/lib/auth/store";
import {
  ACCOUNT_BLOCKED_CODE,
  ACCOUNT_BLOCKED_MESSAGE,
  isAccountBlocked,
} from "@/lib/auth/account-status";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { consumeChallengeToken, verifySecondFactor } from "@/lib/auth/second-factor";
import { clientIp, hit } from "@/lib/auth/rate-limit";
import { logUserAudit } from "@/lib/audit-user";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { z } from "zod";

export const dynamic = "force-dynamic";

const loginVerifySchema = z.object({
  challengeToken: z.string().max(500),
  token: z.string().max(500),
});

/**
 * POST /api/auth/2fa/login-verify
 * Completes the 2FA login challenge: validates the TOTP code against
 * the user's active secret, then creates a session.
 */
export const POST = createPublicHandler(
  {
    body: loginVerifySchema,
    rateLimitKey: (req) => `2fa:login:ip:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 5 * 60 * 1000,
  },
  async (req, body) => {
    const { challengeToken, token } = body;
    const ip = clientIp(req.headers);

    // Verify the challenge token
    const payload = await verifyActionToken(challengeToken, "2fa_challenge");
    if (!payload) {
      return apiError("invalid_challenge", "Invalid challenge token", 401);
    }

    const store = getStore();
    const user = await store.getById(payload.uid);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return apiError("2fa_not_enabled", "2FA not enabled", 400);
    }

    // The account may have been blocked between password and second factor.
    if (await isAccountBlocked(user)) {
      return apiError(ACCOUNT_BLOCKED_CODE, ACCOUNT_BLOCKED_MESSAGE, 403);
    }

    // Verify the bind is still valid (password hasn't changed)
    const expectedBind = await bindFragment(user.id + user.passwordHash);
    if (payload.bind !== expectedBind) {
      return apiError("invalid_challenge", "Invalid challenge token", 401);
    }

    // Per-user rate limit: 5 attempts per 5 minutes (brute-force protection)
    const userRl = await hit(`2fa:login:user:${user.id}`, 5, 5 * 60 * 1000);
    if (!userRl.ok) {
      return Response.json(
        { error: "rate_limited", message: "Zu viele 2FA-Versuche. Bitte später versuchen." },
        { status: 429, headers: { "Retry-After": String(userRl.retryAfterSeconds) } }
      );
    }

    // TOTP (each time step only once per user) or a single-use backup code.
    // Failures count per user — a fresh challenge token does not reset them.
    const factor = await verifySecondFactor(user, token);
    if (!factor.ok) {
      void logUserAudit(
        factor.reason === "locked" ? "user.2fa_locked" : "user.2fa_failed",
        "user",
        user,
        { entityId: user.id, details: { ip } }
      );
      if (factor.reason === "locked") {
        return Response.json(
          {
            error: "two_factor_locked",
            message: "Zu viele falsche Codes. Die Anmeldung ist vorübergehend gesperrt.",
          },
          { status: 429, headers: { "Retry-After": String(factor.retryAfterSeconds ?? 1800) } }
        );
      }
      return apiError("invalid_token", "Invalid TOTP code", 400);
    }
    const usedBackupCode = factor.method === "backup";

    // The challenge is single-use: a second login with the same token fails.
    if (!(await consumeChallengeToken(challengeToken))) {
      return apiError("invalid_challenge", "Invalid challenge token", 401);
    }

    // Create session
    const session = await createSession(user.id, user.email, user.role, {
      userAgent: req.headers.get("user-agent"),
      ip,
    });
    void logUserAudit("user.login", "user", user, {
      entityId: user.id,
      details: { ip, method: usedBackupCode ? "2fa_backup" : "2fa" },
    });

    const res = NextResponse.json({ user: toPublic(user) });
    res.cookies.set(SESSION_COOKIE, session.token, session.cookieOptions);
    return res;
  }
);
