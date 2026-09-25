import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { getStore, buildNewUser, toPublic } from "@/lib/auth/store";
import { createSession, SESSION_COOKIE, REF_COOKIE } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/rate-limit";
import { signActionToken, bindFragment, VERIFY_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { sendMail, siteUrl } from "@/lib/mail";
import { provisionBrainAsync } from "@/lib/provision";
import { signupSchema } from "@/lib/api-validation";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { verifySession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { buildLegalAcceptance, legalAcceptancePatch } from "@/lib/auth/legal-acceptance";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

import { logger } from "@/lib/logger";
const log = logger("api/auth/signup");

// Extended schema with trimmed email and name for internal validation
const signupSchemaInternal = signupSchema.extend({
  email: z
    .string()
    .max(320)
    .transform((val) => val.trim().toLowerCase()),
  name: z
    .string()
    .max(200)
    .transform((val) => val.trim()),
});

export const POST = createPublicHandler(
  {
    body: signupSchemaInternal,
    rateLimitKey: (req) => `signup:ip:${clientIp(req.headers)}`,
    rateLimitMax: env("NODE_ENV") === "production" ? 5 : 100,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (req, body) => {
    const { email, password, name, locale, jurisdiction } = body;

    if (name.length < 1 || name.length > 120) {
      return apiError("invalid_name", "Invalid name", 400);
    }

    const store = getStore();
    if (await store.getByEmail(email)) {
      return apiError("email_taken", "Email already taken", 409);
    }

    // Referral attribution: validate the 90-day ref cookie against a real user.
    let referredBy: string | null = null;
    const refCode = req.cookies.get(REF_COOKIE)?.value;
    if (refCode) {
      const referrer = await store.getByReferralCode(refCode);
      if (referrer && referrer.email !== email) referredBy = refCode; // no self-referrals
    }

    // Subsumio is currently a legal-only product. Archived vertical metadata
    // remains readable for existing tenants, but every new brain is provisioned
    // with the canonical legal pack.
    const industry = "legal";

    // Demo → signup conversion: a visitor who came from the live demo still
    // carries the signed demo session. Read it before provisioning so the
    // seeded matter matches the jurisdiction the visitor experienced.
    // An explicit picker choice in the signup form wins over the demo.
    const demoSession = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    const tenantJurisdiction =
      jurisdiction ?? (demoSession?.demo?.jurisdiction === "de" ? "de" : "at");

    const passwordHash = await hashPassword(password);
    const draft = await buildNewUser({
      email,
      name,
      passwordHash,
      locale: locale === "en" ? "en" : "de",
      referredBy,
      industry,
      // Tenant jurisdiction: explicit signup picker > demo attribution >
      // AT default. Drives law-corpus scoping and seeded demo matter.
      jurisdiction: tenantJurisdiction === "de" ? "DE" : "AT",
      startTrial: true,
    });
    // The schema only lets the request through with acceptTerms/acceptDpa ===
    // true; the record (versions + server time) is stored with the account.
    const acceptance = buildLegalAcceptance(draft, "signup");
    const user = await store.create({ ...draft, ...legalAcceptancePatch(draft, acceptance) });
    void logAudit("user.legal_accepted", "user", {
      brainId: user.brainId,
      entityId: user.id,
      userId: user.id,
      userEmail: user.email,
      ip: clientIp(req.headers),
      details: { ...acceptance },
    });

    // Brain provisioning — fire-and-forget; pre-warms the Engine source so
    // the first dashboard load is instant. Engine lazily creates the source
    // on first write anyway, but this avoids the cold-start penalty.
    provisionBrainAsync(user.brainId, { industry, jurisdiction: tenantJurisdiction });

    // Verification mail — fire-and-forget; signup never fails on mail issues.
    // Without RESEND_API_KEY the mailer prints the link to the server console.
    void (async () => {
      try {
        const verifyToken = await signActionToken(
          { uid: user.id, purpose: "verify", bind: await bindFragment(user.email) },
          VERIFY_TOKEN_TTL_SECONDS
        );
        const verifyUrl = `${siteUrl()}/api/auth/verify?token=${encodeURIComponent(verifyToken)}`;
        const de = user.locale === "de";
        await sendMail({
          to: user.email,
          subject: de ? "Subsumio — E-Mail bestätigen" : "Subsumio — confirm your email",
          text: de
            ? `Guten Tag ${user.name},\n\nwillkommen bei Subsumio. Bitte bestätigen Sie Ihre E-Mail-Adresse (Link 48 Stunden gültig):\n${verifyUrl}\n\n— Subsumio`
            : `Hi ${user.name},\n\nwelcome to Subsumio! Please confirm your email address (link valid for 48 hours):\n${verifyUrl}\n\n— Subsumio`,
        });
      } catch (err) {
        log.error(
          `[signup] verification mail failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })();

    // Attribute the conversion server-side (the funnel's last step) —
    // first-party, independent of client tracking.
    if (demoSession?.demo) {
      const { recordDemoEvent, updateDemoSession } = await import("@/lib/demo/session");
      await updateDemoSession(demoSession.demo.sid, { convertedUserId: user.id });
      await recordDemoEvent(demoSession.demo.sid, "signup", {
        props: { persona: demoSession.demo.persona },
      });
    }

    const session = await createSession(user.id, user.email, user.role, {
      userAgent: req.headers.get("user-agent"),
      ip: clientIp(req.headers),
    });
    const res = NextResponse.json({ user: toPublic(user) }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, session.token, session.cookieOptions);
    res.cookies.delete(REF_COOKIE);
    if (demoSession?.demo) res.cookies.delete("sb_demo");
    return res;
  }
);
