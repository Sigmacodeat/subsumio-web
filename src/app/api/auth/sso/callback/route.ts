import { cookies } from "next/headers";
import { authenticateWithCode } from "@/lib/workos";
import { getStore, buildNewUser } from "@/lib/auth/store";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SSO_STATE_COOKIE = "sb_sso_state";

const ssoCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

/**
 * GET /api/auth/sso/callback?code=...&state=...
 * Empfängt den WorkOS-Callback, validiert den State (CSRF-Schutz),
 * authentifiziert den Nutzer und erstellt eine Subsumio-Session.
 */
export const GET = createPublicHandler(
  {
    query: ssoCallbackSchema,
  },
  async (req, _body, query) => {
    const { code, state, error } = query;

    if (error) {
      console.error("[sso/callback] SSO provider error:", error);
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

    const redirectUri = `${env("NEXT_PUBLIC_APP_URL") || "https://subsum.eu"}/api/auth/sso/callback`;

    try {
      const auth = await authenticateWithCode(code, redirectUri);
      const workosUser = auth.user;

      const store = getStore();
      let user = await store.getByEmail(workosUser.email);

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
      }

      // Update WorkOS link if missing
      if (!user.workosUserId) {
        await store.update(user.id, {
          workosUserId: workosUser.id,
          ssoProvider: "workos",
          emailVerifiedAt: workosUser.email_verified
            ? new Date().toISOString()
            : user.emailVerifiedAt,
        });
      }

      // Create Subsumio session
      const session = await createSession(user.id, user.email, user.role);
      (await cookies()).set(SESSION_COOKIE, session.token, session.cookieOptions);

      // Redirect to dashboard
      return Response.redirect(
        `${env("NEXT_PUBLIC_APP_URL") || "https://subsum.eu"}/dashboard`,
        302
      );
    } catch (err) {
      console.error("[sso callback] error:", err instanceof Error ? err.message : String(err));
      return apiError("sso_failed", "SSO login failed", 500);
    }
  }
);
