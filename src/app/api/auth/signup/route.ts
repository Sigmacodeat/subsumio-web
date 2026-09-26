import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { getStore, type User } from "@/lib/auth/store";
import { SESSION_COOKIE, REF_COOKIE } from "@/lib/auth/session";
import { clientIp, hit } from "@/lib/auth/rate-limit";
import { sendMail, siteUrl } from "@/lib/mail";
import { signupSchema } from "@/lib/api-validation";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { verifySession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createPendingSignupToken } from "@/lib/auth/pending-signup";
import { safeNextPath } from "@/lib/safe-next-path";
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
  /** Where to land after the e-mail is confirmed (same-site path only). */
  next: z.string().max(500).optional(),
});

/** At most this many signup mails per address and hour (confirmation or notice). */
const MAILS_PER_ADDRESS_PER_HOUR = 3;

/**
 * The one answer every valid registration gets — new address or not. It never
 * signs anyone in and never says whether an account exists (see
 * src/lib/auth/pending-signup.ts): the account is created, and the person
 * signed in, when the link in the confirmation mail is opened.
 */
function neutralResponse(extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ verificationRequired: true, ...extra }, { status: 201 });
}

async function mayMail(email: string): Promise<boolean> {
  const r = await hit(`signup:mail:${email}`, MAILS_PER_ADDRESS_PER_HOUR, 60 * 60_000).catch(
    () => ({ ok: true })
  );
  return r.ok;
}

/** Notice to the owner of an existing account: nothing was changed. */
async function sendExistingAccountNotice(user: User): Promise<void> {
  const base = siteUrl();
  const de = user.locale !== "en";
  await sendMail({
    to: user.email,
    subject: de
      ? "Subsumio — Sie haben bereits ein Konto"
      : "Subsumio — you already have an account",
    text: de
      ? `Guten Tag ${user.name},\n\nsoeben wurde versucht, mit dieser E-Mail-Adresse ein neues Subsumio-Konto anzulegen. Sie haben bereits ein Konto — an diesem wurde nichts geändert.\n\nAnmelden: ${base}/login\nPasswort vergessen? ${base}/forgot\n\nFalls Sie das nicht waren, können Sie diese Nachricht ignorieren.\n\n— Subsumio`
      : `Hi ${user.name},\n\nsomeone just tried to create a new Subsumio account with this e-mail address. You already have an account — nothing was changed.\n\nSign in: ${base}/login\nForgot your password? ${base}/forgot\n\nIf this wasn't you, you can ignore this message.\n\n— Subsumio`,
  });
}

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
    // Same work on both paths: the password is hashed and the referral read
    // whether or not the address is taken.
    const passwordHash = await hashPassword(password);
    const existing = await store.getByEmail(email);

    // Referral attribution: validate the 90-day ref cookie against a real user.
    let referredBy: string | null = null;
    const refCode = req.cookies.get(REF_COOKIE)?.value;
    if (refCode) {
      const referrer = await store.getByReferralCode(refCode);
      if (referrer && referrer.email !== email) referredBy = refCode; // no self-referrals
    }

    // Demo → signup conversion: the visitor still carries the signed demo
    // session. Its jurisdiction preselects the tenant's; an explicit choice
    // in the signup form wins.
    const demoSession = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    const tenantJurisdiction =
      jurisdiction ?? (demoSession?.demo?.jurisdiction === "de" ? "de" : "at");

    const withinMailLimit = await mayMail(email);

    if (existing) {
      if (withinMailLimit) {
        void sendExistingAccountNotice(existing).catch((err) =>
          log.error(
            `[signup] existing-account notice failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
      return neutralResponse();
    }

    // New address: nothing is stored yet — the registration travels, sealed,
    // inside the confirmation link (src/lib/auth/pending-signup.ts).
    const token = await createPendingSignupToken({
      email,
      name,
      locale: locale === "en" ? "en" : "de",
      jurisdiction: tenantJurisdiction === "de" ? "DE" : "AT",
      passwordHash,
      referredBy,
      demoSid: demoSession?.demo?.sid ?? null,
      demoPersona: demoSession?.demo?.persona ?? null,
      // The schema only lets the request through with acceptTerms/acceptDpa
      // === true; this is when the person accepted.
      acceptedAt: new Date().toISOString(),
      next: safeNextPath(body.next, "/dashboard"),
    });
    const verifyUrl = `${siteUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;

    if (withinMailLimit) {
      const de = locale !== "en";
      void sendMail({
        to: email,
        subject: de ? "Subsumio — E-Mail bestätigen" : "Subsumio — confirm your email",
        text: de
          ? `Guten Tag ${name},\n\nwillkommen bei Subsumio. Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto anzulegen (Link 48 Stunden gültig):\n${verifyUrl}\n\nFalls Sie sich nicht registriert haben, können Sie diese Nachricht ignorieren.\n\n— Subsumio`
          : `Hi ${name},\n\nwelcome to Subsumio! Please confirm your email address to create your account (link valid for 48 hours):\n${verifyUrl}\n\nIf you didn't sign up, you can ignore this message.\n\n— Subsumio`,
      }).catch((err) =>
        log.error(
          `[signup] verification mail failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }

    // E2E harness only (SUBSUMIO_E2E=1 is never set in production): the
    // specs cannot read a mailbox, so they receive the confirmation link.
    return neutralResponse(env("SUBSUMIO_E2E") === "1" ? { e2eVerifyUrl: verifyUrl } : {});
  }
);
