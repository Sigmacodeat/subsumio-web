import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { getStore, toPublic } from "@/lib/auth/store";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/rate-limit";
import { signActionToken, bindFragment, CHALLENGE_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { loginSchema } from "@/lib/api-validation";
import { isAccountLocked, recordFailedLogin, clearLockout } from "@/lib/auth/lockout";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

// Extended schema with trimmed email for internal validation
const loginSchemaInternal = loginSchema.extend({
  email: z.string().transform((val) => val.trim().toLowerCase()),
});

export const POST = createPublicHandler(
  {
    body: loginSchemaInternal,
    rateLimitKey: (req) => `login:ip:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
  },
  async (req, body) => {
    const { email, password } = body;
    const ip = clientIp(req.headers);

    // Account lockout check: after 5 failed attempts, lock for 30 minutes
    const lockStatus = await isAccountLocked(email);
    if (lockStatus.locked) {
      return apiError(
        "account_locked",
        "Account temporarily locked due to too many failed attempts.",
        429,
        { retryAfterSeconds: lockStatus.retryAfterSeconds }
      );
    }

    const user = await getStore().getByEmail(email);

    // Same error for unknown email and wrong password — no account enumeration.
    if (!user) {
      return apiError("invalid_credentials", "Invalid credentials", 401);
    }

    // SSO users have no local password — redirect them to SSO login
    if (!user.passwordHash) {
      return apiError("sso_required", "SSO login required", 401, {
        provider: user.ssoProvider ?? "sso",
      });
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      const failStatus = await recordFailedLogin(email);
      if (failStatus.locked) {
        return apiError("account_locked", "Account locked due to too many failed attempts.", 429, {
          retryAfterSeconds: failStatus.retryAfterSeconds,
        });
      }
      return apiError("invalid_credentials", "Invalid credentials", 401);
    }

    // Successful login — clear any lockout state
    await clearLockout(email);

    // 2FA enforcement: if enabled, return a challenge token instead of a session.
    // The client must POST to /api/auth/2fa/login-verify with the TOTP code.
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const challengeBind = await bindFragment(user.id + user.passwordHash);
      const challengeToken = await signActionToken(
        { uid: user.id, purpose: "2fa_challenge", bind: challengeBind },
        CHALLENGE_TOKEN_TTL_SECONDS
      );
      return NextResponse.json({ error: "2fa_required", challengeToken });
    }

    const session = await createSession(user.id, user.email, user.role);
    void logAudit("user.login", "user", { entityId: user.id, details: { ip } });
    const res = NextResponse.json({ user: toPublic(user) });
    res.cookies.set(SESSION_COOKIE, session.token, session.cookieOptions);
    return res;
  }
);
