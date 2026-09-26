import { createPublicHandler } from "@/lib/api-handler";
import { buildNewUser, getStore } from "@/lib/auth/store";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { clientIp } from "@/lib/auth/rate-limit";
import { createSession, SESSION_COOKIE, REF_COOKIE } from "@/lib/auth/session";
import { readPendingSignupToken, type PendingSignup } from "@/lib/auth/pending-signup";
import { buildLegalAcceptance, legalAcceptancePatch } from "@/lib/auth/legal-acceptance";
import { provisionBrainAsync } from "@/lib/provision";
import { logAudit } from "@/lib/audit";
import { safeNextPath } from "@/lib/safe-next-path";
import { env } from "@/lib/env";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
const log = logger("api/auth/verify");

const verifySchema = z.object({
  // Signup links carry the sealed registration and are longer than plain
  // verification links.
  token: z.string().max(4096),
});

/**
 * Creates the account of a confirmed registration (src/lib/auth/pending-
 * signup.ts), signs the person in and sends them on. Returns null when the
 * address has an account by now (an older link, or two links opened).
 */
async function completeSignup(req: NextRequest, p: PendingSignup, appUrl: string) {
  const store = getStore();
  if (await store.getByEmail(p.email)) return null;

  const draft = await buildNewUser({
    email: p.email,
    name: p.name,
    passwordHash: p.passwordHash,
    locale: p.locale,
    referredBy: p.referredBy,
    // Subsumio is a legal-only product: every new brain gets the legal pack.
    industry: "legal",
    jurisdiction: p.jurisdiction,
    startTrial: true,
  });
  const acceptedAt = new Date(p.acceptedAt);
  const acceptance = buildLegalAcceptance(
    draft,
    "signup",
    Number.isFinite(acceptedAt.getTime()) ? acceptedAt : new Date()
  );
  let user;
  try {
    user = await store.create({
      ...draft,
      ...legalAcceptancePatch(draft, acceptance),
      // Opening the link proves the address.
      emailVerifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    // The address was taken in the meantime (unique e-mail).
    if (await store.getByEmail(p.email)) return null;
    throw err;
  }
  void logAudit("user.legal_accepted", "user", {
    brainId: user.brainId,
    entityId: user.id,
    userId: user.id,
    userEmail: user.email,
    ip: clientIp(req.headers),
    details: { ...acceptance },
  });

  // Pre-warms the engine source so the first dashboard load is instant.
  provisionBrainAsync(user.brainId, {
    industry: "legal",
    jurisdiction: p.jurisdiction === "DE" ? "de" : "at",
  });

  // Demo conversion, attributed server-side.
  if (p.demoSid) {
    try {
      const { recordDemoEvent, updateDemoSession } = await import("@/lib/demo/session");
      await updateDemoSession(p.demoSid, { convertedUserId: user.id });
      await recordDemoEvent(p.demoSid, "signup", {
        props: p.demoPersona ? { persona: p.demoPersona } : {},
      });
    } catch (err) {
      log.warn("[verify] demo attribution failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const session = await createSession(user.id, user.email, user.role, {
    userAgent: req.headers.get("user-agent"),
    ip: clientIp(req.headers),
  });
  const res = NextResponse.redirect(new URL(safeNextPath(p.next, "/dashboard"), appUrl));
  res.cookies.set(SESSION_COOKIE, session.token, session.cookieOptions);
  res.cookies.delete(REF_COOKIE);
  res.cookies.delete("sb_demo");
  return res;
}

export const GET = createPublicHandler(
  {
    query: verifySchema,
    rateLimitKey: (req) => `auth-verify:ip:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    const { token } = query;
    const appUrl = env("NEXT_PUBLIC_APP_URL") || "https://subsum.io";

    // A registration confirmation: the account is created now.
    const pending = await readPendingSignupToken(token);
    if (pending) {
      const done = await completeSignup(req, pending, appUrl);
      return done ?? Response.redirect(new URL("/login?verify=exists", appUrl));
    }

    const payload = await verifyActionToken(token, "verify");
    if (!payload) {
      return Response.redirect(new URL("/login?verify=invalid", appUrl));
    }

    const store = getStore();
    const user = await store.getById(payload.uid);
    if (!user || (await bindFragment(user.email)) !== payload.bind) {
      return Response.redirect(new URL("/login?verify=invalid", appUrl));
    }

    if (!user.emailVerifiedAt) {
      await store.update(user.id, { emailVerifiedAt: new Date().toISOString() });
    }
    // Logged-in users land in the app; logged-out users hit the login redirect.
    return Response.redirect(new URL("/dashboard", appUrl));
  }
);
