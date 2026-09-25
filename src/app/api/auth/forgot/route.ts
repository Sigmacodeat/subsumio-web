import { NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { signActionToken, bindFragment, RESET_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { clientIp, hit } from "@/lib/auth/rate-limit";
import { createHash } from "node:crypto";
import { sendMail, siteUrl } from "@/lib/mail";
import { createPublicHandler } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { z } from "zod";

/** Reset mails per address and hour (independent of the requesting IP). */
const FORGOT_PER_EMAIL_MAX = 3;
const FORGOT_PER_EMAIL_WINDOW_MS = 60 * 60_000;

const forgotSchema = z.object({
  email: z.string().email(),
});

export const POST = createPublicHandler(
  {
    body: forgotSchema,
    rateLimitKey: (req) => `forgot:ip:${clientIp(req.headers)}`,
    rateLimitMax: 5,
    rateLimitWindowMs: 15 * 60_000,
  },
  async (req, body) => {
    const { email } = body;
    const trimmedEmail = email.trim().toLowerCase();

    // Per-address cap on top of the per-IP limit: rotating IPs must not be
    // able to flood one mailbox. Counted for unknown addresses too, so the
    // cap itself does not reveal whether an account exists.
    const perEmail = await hit(
      `forgot:email:${createHash("sha256").update(trimmedEmail).digest("hex")}`,
      FORGOT_PER_EMAIL_MAX,
      FORGOT_PER_EMAIL_WINDOW_MS
    );
    if (!perEmail.ok) return NextResponse.json({ ok: true });

    const user = await getStore().getByEmail(trimmedEmail);

    // Always 200 — no account enumeration via this endpoint.
    if (!user) return NextResponse.json({ ok: true });

    // SSO-only accounts (no local password) sign in through their identity
    // provider. A reset link would create a local password next to the IdP
    // and bypass its offboarding and policies — so none is issued.
    if (!user.passwordHash) return NextResponse.json({ ok: true });

    const token = await signActionToken(
      { uid: user.id, purpose: "reset", bind: await bindFragment(user.passwordHash) },
      RESET_TOKEN_TTL_SECONDS
    );
    const lang = user.locale === "de" ? "de" : "en";
    const resetUrl = `${siteUrl()}${lang === "en" ? "/en" : ""}/reset?token=${encodeURIComponent(token)}`;

    const subject =
      lang === "de" ? "Subsumio — Passwort zurücksetzen" : "Subsumio — reset your password";
    const text =
      lang === "de"
        ? `Guten Tag ${user.name},\n\nfür dieses Konto wurde ein neues Passwort angefordert.\n\nLink (1 Stunde gültig):\n${resetUrl}\n\nFalls Sie das nicht waren, können Sie diese Nachricht ignorieren. Ihr Passwort bleibt unverändert.\n\n— Subsumio`
        : `Hi ${user.name},\n\nsomeone (hopefully you) requested a new password for this account.\n\nLink (valid for 1 hour):\n${resetUrl}\n\nIf this wasn't you, ignore this email — your password stays unchanged.\n\n— Subsumio`;

    const result = await sendMail({ to: user.email, subject, text });

    // Dev convenience: without a mail provider, hand the link to the UI so
    // local / first-customer testing works end to end. NEVER in production.
    if (!result.sent && env("NODE_ENV") !== "production") {
      return NextResponse.json({ ok: true, devResetUrl: resetUrl });
    }
    return NextResponse.json({ ok: true });
  }
);
