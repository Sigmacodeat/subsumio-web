import { NextRequest, NextResponse } from "next/server";
import { getStore, toPublic } from "@/lib/auth/store";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { verifyTOTP } from "@/lib/totp";
import { verifyBackupCode } from "@/lib/auth/backup-codes";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/login-verify
 * Completes the 2FA login challenge: validates the TOTP code against
 * the user's active secret, then creates a session.
 *
 * Body: { challengeToken: string, token: string }
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  let body: { challengeToken?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { challengeToken, token } = body;
  if (!challengeToken || !token) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Verify the challenge token
  const payload = await verifyActionToken(challengeToken, "2fa_challenge");
  if (!payload) {
    return NextResponse.json({ error: "invalid_challenge" }, { status: 401 });
  }

  // Rate limit: 5 TOTP attempts per 5 minutes per user
  const rl = await hit(`2fa:login:${payload.uid}`, 5, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Zu viele Versuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const store = getStore();
  const user = await store.getById(payload.uid);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: "2fa_not_enabled" }, { status: 400 });
  }

  // Verify the bind is still valid (password hasn't changed)
  const expectedBind = await bindFragment(user.id + user.passwordHash);
  if (payload.bind !== expectedBind) {
    return NextResponse.json({ error: "invalid_challenge" }, { status: 401 });
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
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  // Create session
  const sessionToken = await signSession({ uid: user.id, email: user.email, role: user.role });
  void logAudit("user.login", "user", { entityId: user.id, details: { ip, method: usedBackupCode ? "2fa_backup" : "2fa" } });

  const res = NextResponse.json({ user: toPublic(user) });
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}
