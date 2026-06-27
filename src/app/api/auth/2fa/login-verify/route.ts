import { NextResponse } from "next/server";
import { getStore, toPublic } from "@/lib/auth/store";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { verifyTOTP } from "@/lib/totp";
import { verifyBackupCode } from "@/lib/auth/backup-codes";
import { clientIp, hit } from "@/lib/auth/rate-limit";
import { logAudit } from "@/lib/audit";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { z } from "zod";

export const dynamic = "force-dynamic";

const loginVerifySchema = z.object({
  challengeToken: z.string(),
  token: z.string(),
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

    // Try TOTP first, then backup codes as fallback
    let valid = await verifyTOTP(token, user.twoFactorSecret);
    let usedBackupCode = false;

    if (!valid && user.twoFactorBackupCodes && user.twoFactorBackupCodes.length > 0) {
      const backupIdx = await verifyBackupCode(token, user.twoFactorBackupCodes);
      if (backupIdx >= 0) {
        valid = true;
        usedBackupCode = true;
        // Consume the used backup code
        const remaining = user.twoFactorBackupCodes.filter((_, i) => i !== backupIdx);
        await store.update(user.id, { twoFactorBackupCodes: remaining });
      }
    }

    if (!valid) {
      return apiError("invalid_token", "Invalid TOTP code", 400);
    }

    // Create session
    const sessionToken = await signSession({ uid: user.id, email: user.email, role: user.role });
    void logAudit("user.login", "user", {
      entityId: user.id,
      details: { ip, method: usedBackupCode ? "2fa_backup" : "2fa" },
    });

    const res = NextResponse.json({ user: toPublic(user) });
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: env("NODE_ENV") === "production",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });
    return res;
  }
);
