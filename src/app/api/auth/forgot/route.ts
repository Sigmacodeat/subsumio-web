import { NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { signActionToken, bindFragment, RESET_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { clientIp } from "@/lib/auth/rate-limit";
import { sendMail, siteUrl } from "@/lib/mail";
import { createPublicHandler } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { z } from "zod";

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

    const user = await getStore().getByEmail(trimmedEmail);

    // Always 200 — no account enumeration via this endpoint.
    if (!user) return NextResponse.json({ ok: true });

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
        ? `Hallo ${user.name},\n\njemand (hoffentlich du) hat ein neues Passwort für dieses Konto angefordert.\n\nLink (1 Stunde gültig):\n${resetUrl}\n\nWenn du das nicht warst, ignoriere diese Mail — dein Passwort bleibt unverändert.\n\n— Subsumio`
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
