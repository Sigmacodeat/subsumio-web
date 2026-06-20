import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { getStore, toPublic } from "@/lib/auth/store";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import { logAudit } from "@/lib/audit";
import { signActionToken, bindFragment, CHALLENGE_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { validateRequest, loginSchema } from "@/lib/api-validation";
import { isAccountLocked, recordFailedLogin, clearLockout } from "@/lib/auth/lockout";

export async function POST(req: NextRequest) {
  // Brute-force protection: per-IP and (below, post-parse) per-email windows.
  const ip = clientIp(req.headers);
  const ipLimit = await hit(`login:ip:${ip}`, 20, 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  const parsed = await validateRequest(req, loginSchema);
  if (!parsed.ok) return parsed.error;
  const { email: rawEmail, password } = parsed.data;
  const email = rawEmail.trim().toLowerCase();

  // Account lockout check: after 5 failed attempts, lock for 30 minutes
  const lockStatus = await isAccountLocked(email);
  if (lockStatus.locked) {
    return NextResponse.json(
      { error: "account_locked", message: "Account temporarily locked due to too many failed attempts." },
      { status: 429, headers: { "Retry-After": String(lockStatus.retryAfterSeconds) } },
    );
  }

  const emailLimit = await hit(`login:email:${email}`, 5, 15 * 60_000);
  if (!emailLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSeconds) } },
    );
  }

  const user = await getStore().getByEmail(email);

  // Same error for unknown email and wrong password — no account enumeration.
  if (!user) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // SSO users have no local password — redirect them to SSO login
  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "sso_required", provider: user.ssoProvider ?? "sso" },
      { status: 401 },
    );
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failStatus = await recordFailedLogin(email);
    if (failStatus.locked) {
      return NextResponse.json(
        { error: "account_locked", message: "Account locked due to too many failed attempts." },
        { status: 429, headers: { "Retry-After": String(failStatus.retryAfterSeconds) } },
      );
    }
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Successful login — clear any lockout state
  await clearLockout(email);

  // 2FA enforcement: if enabled, return a challenge token instead of a session.
  // The client must POST to /api/auth/2fa/login-verify with the TOTP code.
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const challengeBind = await bindFragment(user.id + user.passwordHash);
    const challengeToken = await signActionToken(
      { uid: user.id, purpose: "2fa_challenge", bind: challengeBind },
      CHALLENGE_TOKEN_TTL_SECONDS,
    );
    return NextResponse.json(
      { error: "2fa_required", challengeToken },
      { status: 200 },
    );
  }

  const token = await signSession({ uid: user.id, email: user.email, role: user.role });
  void logAudit("user.login", "user", { entityId: user.id, details: { ip } });
  const res = NextResponse.json({ user: toPublic(user) });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}
