import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { getStore, buildNewUser, toPublic } from "@/lib/auth/store";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS, REF_COOKIE } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/rate-limit";
import { signActionToken, bindFragment, VERIFY_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { sendMail, siteUrl } from "@/lib/mail";
import { isValidIndustry } from "@/lib/industry-pack";
import { provisionBrainAsync } from "@/lib/provision";
import { signupSchema } from "@/lib/api-validation";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { z } from "zod";

// Extended schema with trimmed email and name for internal validation
const signupSchemaInternal = signupSchema.extend({
  email: z.string().transform((val) => val.trim().toLowerCase()),
  name: z.string().transform((val) => val.trim()),
});

export const POST = createPublicHandler(
  {
    body: signupSchemaInternal,
    rateLimitKey: (req) => `signup:ip:${clientIp(req.headers)}`,
    rateLimitMax: env("NODE_ENV") === "production" ? 5 : 100,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (req, body) => {
    const { email, password, name, locale, industry: rawIndustry } = body;

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

    // Industry powers dashboard personalization AND the schema pack the tenant's
    // brain gets provisioned with (packForIndustry → subsumio-<vertical>). Allowlist
    // is the single source in lib/industry-pack (covers all 8 branded verticals);
    // optional, silently dropped when unknown.
    const industry = isValidIndustry(rawIndustry) ? rawIndustry : null;

    const passwordHash = await hashPassword(password);
    const user = await store.create(
      await buildNewUser({
        email,
        name,
        passwordHash,
        locale: locale === "de" ? "de" : "en",
        referredBy,
        industry,
      })
    );

    // Brain provisioning — fire-and-forget; pre-warms the Engine source so
    // the first dashboard load is instant. Engine lazily creates the source
    // on first write anyway, but this avoids the cold-start penalty.
    provisionBrainAsync(user.brainId, { industry });

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
            ? `Hallo ${user.name},\n\nwillkommen bei Subsumio! Bitte bestätige deine E-Mail-Adresse (Link 48 Stunden gültig):\n${verifyUrl}\n\n— Subsumio`
            : `Hi ${user.name},\n\nwelcome to Subsumio! Please confirm your email address (link valid for 48 hours):\n${verifyUrl}\n\n— Subsumio`,
        });
      } catch (err) {
        console.error(
          `[signup] verification mail failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })();

    const token = await signSession({ uid: user.id, email: user.email, role: user.role });
    const res = NextResponse.json({ user: toPublic(user) }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env("NODE_ENV") === "production",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });
    res.cookies.delete(REF_COOKIE);
    return res;
  }
);
