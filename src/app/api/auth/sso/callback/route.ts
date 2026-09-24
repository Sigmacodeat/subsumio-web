import { cookies } from "next/headers";
import { authenticateWithCode } from "@/lib/workos";
import { getStore, getOrgStore, buildNewUser } from "@/lib/auth/store";
import { ACCOUNT_BLOCKED_CODE, isAccountBlocked } from "@/lib/auth/account-status";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { signActionToken, bindFragment, CHALLENGE_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { decideSsoAccountLink } from "@/lib/auth/sso-account-link";
import { twoFactorPolicyFor } from "@/lib/kanzlei-settings-server";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { clientIp } from "@/lib/auth/rate-limit";
import { z } from "zod";

import { logger } from "@/lib/logger";
const log = logger("api/auth/sso/callback");

export const dynamic = "force-dynamic";

const SSO_STATE_COOKIE = "sb_sso_state";

const ssoCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

function appUrl(): string {
  return env("NEXT_PUBLIC_APP_URL") || "https://subsum.io";
}

function loginRedirect(errorCode: string): Response {
  return Response.redirect(`${appUrl()}/at/login?error=${encodeURIComponent(errorCode)}`, 302);
}

/**
 * GET /api/auth/sso/callback?code=...&state=...
 * Empfängt den WorkOS-Callback, validiert den State (CSRF-Schutz),
 * authentifiziert den Nutzer und erstellt eine Subsumio-Session.
 *
 * Account binding (src/lib/auth/sso-account-link.ts): an existing account is
 * only signed into when WorkOS authenticated the user inside the firm's own
 * SSO organization (Org.workosOrganizationId), or — without a configured
 * organization — with the exact WorkOS identity the account is already bound
 * to. An e-mail match alone never links an identity.
 *
 * Second factor: SSO does NOT replace Subsumio's own 2FA. It follows the
 * same policy as password login — a user with 2FA enabled gets a TOTP
 * challenge (completed via /api/auth/2fa/login-verify); a firm that requires
 * 2FA gets a must2fa session for users who have not set it up yet; an
 * unreadable firm policy fails closed (no session).
 */
export const GET = createPublicHandler(
  {
    query: ssoCallbackSchema,
    rateLimitKey: (req) => `sso-callback:ip:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    const { code, state, error } = query;

    if (error) {
      log.error("[sso/callback] SSO provider error:", error);
      return apiError("sso_denied", "SSO denied", 400);
    }
    if (!code) {
      return apiError("code_required", "Code required", 400);
    }

    // CSRF protection: validate state against the httpOnly cookie set during SSO initiation.
    // Timing-safe comparison prevents oracle attacks on the state value.
    const jar = await cookies();
    const stateCookie = jar.get(SSO_STATE_COOKIE)?.value ?? "";
    if (!state || !stateCookie || !timingSafeCompare(state, stateCookie)) {
      return apiError("sso_state_mismatch", "SSO state mismatch", 403);
    }
    // Clear the state cookie — single use
    jar.delete(SSO_STATE_COOKIE);

    const redirectUri = `${appUrl()}/api/auth/sso/callback`;

    try {
      const auth = await authenticateWithCode(code, redirectUri);
      const workosUser = auth.user;
      const authOrganizationId = auth.organization_id ?? workosUser.organization_id ?? null;

      const store = getStore();
      let user = await store.getByEmail(workosUser.email);
      let provisioned = false;

      if (!user) {
        // Auto-provision: create user from WorkOS profile
        const newUser = await buildNewUser({
          email: workosUser.email,
          name: `${workosUser.first_name} ${workosUser.last_name}`.trim() || workosUser.email,
          passwordHash: "", // SSO users have no local password
          locale: "de",
        });
        // Mark as SSO user — mutate after buildNewUser to avoid typing issues
        newUser.workosUserId = workosUser.id;
        newUser.ssoProvider = "workos";
        newUser.emailVerifiedAt = workosUser.email_verified ? new Date().toISOString() : null;
        user = await store.create(newUser);
        provisioned = true;
      } else {
        const org = user.orgId ? await getOrgStore().getById(user.orgId) : null;
        const decision = decideSsoAccountLink({
          user,
          org,
          workosUserId: workosUser.id,
          emailVerified: workosUser.email_verified === true,
          authOrganizationId,
        });
        if (!decision.ok) {
          log.warn(
            `[sso/callback] SSO sign-in refused for existing account ${user.id}: ${decision.reason}`
          );
          return loginRedirect("sso_not_linked");
        }
        if (await isAccountBlocked(user)) return loginRedirect(ACCOUNT_BLOCKED_CODE);
        if (decision.bind) {
          user =
            (await store.update(user.id, {
              workosUserId: workosUser.id,
              ssoProvider: user.ssoProvider || "workos",
              emailVerifiedAt: user.emailVerifiedAt || new Date().toISOString(),
            })) ?? user;
        }
      }

      if (await isAccountBlocked(user)) return loginRedirect(ACCOUNT_BLOCKED_CODE);

      // Same 2FA policy as password login (src/app/api/auth/login/route.ts).
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        const challengeBind = await bindFragment(user.id + user.passwordHash);
        const challengeToken = await signActionToken(
          { uid: user.id, purpose: "2fa_challenge", bind: challengeBind },
          CHALLENGE_TOKEN_TTL_SECONDS
        );
        // Fragment, not query: never sent to a server or leaked via Referer.
        return Response.redirect(
          `${appUrl()}/at/login#sso2fa=${encodeURIComponent(challengeToken)}`,
          302
        );
      }
      let must2fa = false;
      // A freshly provisioned SSO account is a new solo workspace (like
      // self-service signup) — no firm policy can apply to it yet.
      if (!provisioned) {
        const policy = await twoFactorPolicyFor(user);
        if (policy === "unknown") return loginRedirect("two_factor_policy_unavailable");
        must2fa = policy === "required";
      }

      // Create Subsumio session
      const session = await createSession(user.id, user.email, user.role, {
        must2fa,
        userAgent: req.headers.get("user-agent"),
        ip: clientIp(req.headers),
      });
      (await cookies()).set(SESSION_COOKIE, session.token, session.cookieOptions);
      void logAudit("user.login", "user", {
        entityId: user.id,
        details: { method: "sso", ip: clientIp(req.headers) },
      });

      // must2fa sessions are confined to the 2FA setup flow by middleware.
      return Response.redirect(`${appUrl()}/dashboard`, 302);
    } catch (err) {
      log.error("[sso callback] error:", err instanceof Error ? err.message : String(err));
      return apiError("sso_failed", "SSO login failed", 500);
    }
  }
);
